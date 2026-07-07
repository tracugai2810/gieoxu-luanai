const SUPABASE_URL = process.env.SUPABASE_URL || 'https://solgyybbukgeggqsxnxx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_fIqAdNcP094vgyCNViVkwQ_7cRdHsgo';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Must be set in Vercel Env Vars

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function supabaseRequest(endpoint, method = 'GET', body = null, useServiceRole = false, customHeaders = {}) {
    const key = useServiceRole ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
    const headers = {
        'apikey': key,
        'Authorization': customHeaders.Authorization || `Bearer ${key}`,
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

    const { action } = req.query;

    try {
        // OAuth handles login and signup directly via Supabase.
        if (action === 'signup' || action === 'login') {
            return res.status(400).json({ error: 'Please use Google Login' });
        }

        // Các action dưới đây yêu cầu Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Missing token' });
        const token = authHeader.replace('Bearer ', '').trim();

        // Xác minh token & lấy user
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        });
        if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
        const user = await userRes.json();
        const userId = user.id;

        if (req.method === 'GET' && action === 'profile') {
            const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=*`, 'GET', null, false, { Authorization: `Bearer ${token}` });
            if (!profiles || profiles.length === 0) return res.status(404).json({ error: 'Profile not found' });
            const profile = profiles[0];
            if (!profile.email) profile.email = user.email;
            return res.status(200).json({ success: true, profile: profile });
        }

        if (req.method === 'POST' && action === 'checkin') {
            const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=xu_balance,last_checkin`, 'GET', null, false, { Authorization: `Bearer ${token}` });
            if (!profiles || profiles.length === 0) return res.status(404).json({ error: 'Profile not found' });
            const profile = profiles[0];
            
            // Lấy ngày hiện tại ở VN (UTC+7)
            const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
            const todayStr = today.toISOString().split('T')[0];

            if (profile.last_checkin === todayStr) {
                return res.status(400).json({ error: 'Hôm nay bạn đã điểm danh rồi. Hãy quay lại vào ngày mai nhé!' });
            }

            if (!SUPABASE_SERVICE_KEY) throw new Error("Chưa cấu hình Service Key trên server");

            // Cộng xu & cập nhật ngày
            const newXu = profile.xu_balance + 5;
            await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', {
                xu_balance: newXu,
                last_checkin: todayStr
            }, true); // useServiceRole = true

            // Ghi lịch sử
            await supabaseRequest('/rest/v1/xu_transactions', 'POST', {
                user_id: userId,
                amount: 5,
                type: 'daily_checkin',
                description: 'Điểm danh hàng ngày'
            }, true);

            return res.status(200).json({ 
                success: true, 
                message: 'Điểm danh thành công! Bạn nhận được +5 xu.',
                xuRemaining: newXu
            });
        }

        if (req.method === 'GET' && action === 'missions') {
            // 1. Lấy tất cả missions active
            let missions = await supabaseRequest(`/rest/v1/missions?is_active=eq.true&order=is_hot.desc,created_at.desc`, 'GET', null, true);
            if (!missions) missions = [];
            
            // 2. Lấy các mission_id user đã làm
            let userMissions = await supabaseRequest(`/rest/v1/user_missions?user_id=eq.${userId}&select=mission_id`, 'GET', null, true);
            if (!userMissions) userMissions = [];
            const completedIds = userMissions.map(um => um.mission_id);
            
            // 3. Lấy thông tin điểm danh (last_checkin)
            const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=last_checkin`, 'GET', null, false, { Authorization: `Bearer ${token}` });
            const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })).toISOString().split('T')[0];
            const hasCheckedIn = profiles && profiles.length > 0 && profiles[0].last_checkin === today;

            return res.status(200).json({
                success: true,
                missions: missions.map(m => ({
                    ...m,
                    is_completed: completedIds.includes(m.id)
                })),
                checkinState: {
                    is_completed: hasCheckedIn
                }
            });
        }

        if (req.method === 'POST' && action === 'request_deposit') {
            const { mission_id } = req.body;
            if (!mission_id) {
                return res.status(400).json({ success: false, error: 'Thiếu mission_id' });
            }

            // Lưu vào bảng deposit_requests
            await supabaseRequest('/rest/v1/deposit_requests', 'POST', {
                user_id: userId,
                mission_id: mission_id,
                status: 'pending'
            }, true);

            return res.status(200).json({ success: true, message: 'Đã gửi yêu cầu nạp' });
        }


        return res.status(404).json({ error: 'Action not found' });

    } catch (error) {
        let errorMsg = "Internal Server Error";
        try {
            // Cố gắng parse lỗi từ Supabase
            const parsed = JSON.parse(error.message);
            errorMsg = parsed.msg || parsed.error_description || parsed.message || error.message;
        } catch(e) {
            errorMsg = error.message;
        }
        return res.status(500).json({ error: errorMsg });
    }
};
