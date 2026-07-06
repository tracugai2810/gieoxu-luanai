const SUPABASE_URL = process.env.SUPABASE_URL || 'https://solgyybbukgeggqsxnxx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_fIqAdNcP094vgyCNViVkwQ_7cRdHsgo';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Must be set in Vercel Env Vars

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function supabaseRequest(endpoint, method = 'GET', body = null, useServiceRole = true, customHeaders = {}) {
    const key = useServiceRole ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
    const headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...customHeaders
    };
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(`${SUPABASE_URL}${endpoint}`, options);
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).send('ok');
    }

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Chưa cấu hình Service Key trên Server' });
    }

    const { action } = req.query;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing token' });
    const token = authHeader.replace('Bearer ', '').trim();

    try {
        // 1. Validate Token & Check Admin Role
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        });
        if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
        const user = await userRes.json();
        
        const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${user.id}&select=role`, 'GET', null, false, { Authorization: `Bearer ${token}` });
        if (!profiles || profiles.length === 0 || profiles[0].role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }

        // 2. Handle Admin Actions
        if (req.method === 'GET' && action === 'stats') {
            // Thống kê cơ bản
            const usersReq = supabaseRequest('/rest/v1/profiles?select=id', 'GET', null, true, { 'Prefer': 'count=exact' });
            
            const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
            today.setHours(0,0,0,0);
            const todayStr = today.toISOString();
            
            const usageReq = supabaseRequest(`/rest/v1/divination_history?created_at=gte.${todayStr}&select=id,xu_cost`, 'GET');
            
            const [usersRes, usageRes] = await Promise.all([usersReq, usageReq]);
            
            // Tính tổng xu tiêu thụ hôm nay
            const totalXuToday = usageRes.reduce((sum, item) => sum + item.xu_cost, 0);

            return res.status(200).json({
                success: true,
                stats: {
                    totalUsers: usersRes.length || 0, // In full app use count headers, simplify here
                    queriesToday: usageRes.length || 0,
                    xuConsumedToday: totalXuToday
                }
            });
        }

        if (req.method === 'GET' && action === 'config') {
            const config = await supabaseRequest('/rest/v1/ai_config?select=*');
            return res.status(200).json({ success: true, data: config });
        }

        if (req.method === 'POST' && action === 'config') {
            const { key, value } = req.body; // key: 'models' | 'api_keys'
            if (!key || !value) return res.status(400).json({ error: 'Invalid body' });
            
            await supabaseRequest(`/rest/v1/ai_config?config_key=eq.${key}`, 'PATCH', {
                config_value: value,
                updated_at: new Date().toISOString()
            });
            return res.status(200).json({ success: true, message: 'Saved successfully' });
        }

        if (req.method === 'GET' && action === 'users') {
            const usersList = await supabaseRequest('/rest/v1/profiles?select=*&order=created_at.desc');
            return res.status(200).json({ success: true, data: usersList });
        }

        if (req.method === 'POST' && action === 'update_xu') {
            const { email, amount, description } = req.body; // amount can be positive or negative
            if (!email || amount === undefined) return res.status(400).json({ error: 'Invalid body' });

            const targetProfile = await supabaseRequest(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,xu_balance`);
            if (!targetProfile || targetProfile.length === 0) return res.status(404).json({ error: 'User not found' });

            const userId = targetProfile[0].id;
            const newXu = targetProfile[0].xu_balance + amount;
            
            await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { xu_balance: newXu });
            
            // Log transaction
            await supabaseRequest('/rest/v1/xu_transactions', 'POST', {
                user_id: userId,
                amount: amount,
                type: 'admin_topup',
                description: description || 'Admin điều chỉnh xu'
            });

            return res.status(200).json({ success: true, newXu });
        }

        if (req.method === 'POST' && action === 'delete_user') {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            
            // Delete from auth.users
            await supabaseRequest(`/auth/v1/admin/users/${userId}`, 'DELETE');
            // Xóa profile (phòng trường hợp DB không có cascade)
            await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'DELETE');
            
            return res.status(200).json({ success: true, message: 'Đã xóa người dùng thành công' });
        }

        if (req.method === 'POST' && action === 'reset_password') {
            const { userId, newPassword } = req.body;
            if (!userId || !newPassword) return res.status(400).json({ error: 'Missing userId or newPassword' });
            
            // Update auth.users password
            await supabaseRequest(`/auth/v1/admin/users/${userId}`, 'PUT', { password: newPassword });
            
            return res.status(200).json({ success: true, message: 'Đã đổi mật khẩu thành công' });
        }

        // ==========================================
        // QUẢN LÝ NHIỆM VỤ (MISSIONS)
        // ==========================================
        if (req.method === 'GET' && action === 'get_missions') {
            const data = await supabaseRequest('/rest/v1/missions?order=created_at.desc');
            return res.status(200).json({ success: true, data: data || [] });
        }

        if (req.method === 'POST' && action === 'add_mission') {
            const { title, reward_xu, action_url, is_hot } = req.body;
            await supabaseRequest('/rest/v1/missions', 'POST', {
                title, reward_xu, action_url, is_hot
            });
            return res.status(200).json({ success: true });
        }

        if (req.method === 'POST' && action === 'update_mission') {
            const { id, is_active } = req.body;
            await supabaseRequest(`/rest/v1/missions?id=eq.${id}`, 'PATCH', { is_active });
            return res.status(200).json({ success: true });
        }

        if (req.method === 'POST' && action === 'delete_mission') {
            const { id } = req.body;
            // Xóa user_missions liên quan trước
            await supabaseRequest(`/rest/v1/user_missions?mission_id=eq.${id}`, 'DELETE');
            // Sau đó xóa mission
            await supabaseRequest(`/rest/v1/missions?id=eq.${id}`, 'DELETE');
            return res.status(200).json({ success: true });
        }

        return res.status(404).json({ error: 'Action not found' });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
