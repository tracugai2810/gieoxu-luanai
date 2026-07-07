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
        if (req.method === 'POST' && action === 'refresh') {
            const { refresh_token } = req.body;
            if (!refresh_token) return res.status(400).json({ error: 'Missing refresh token' });
            
            const result = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token }, false);
            return res.status(200).json({ success: true, data: result });
        }
        
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
            let profile = profiles[0];
            if (!profile.email) profile.email = user.email;

            // Generate referral_code if missing
            if (!profile.referral_code) {
                const crypto = require('crypto');
                const refCode = crypto.createHash('md5').update(profile.id).digest('hex').substring(0, 6).toUpperCase();
                await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { referral_code: refCode }, true);
                profile.referral_code = refCode;
            }

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
            
            // 3. Lấy thông tin điểm danh (last_checkin) và người giới thiệu (referred_by)
            const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=last_checkin,referred_by`, 'GET', null, false, { Authorization: `Bearer ${token}` });
            const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })).toISOString().split('T')[0];
            const hasCheckedIn = profiles && profiles.length > 0 && profiles[0].last_checkin === today;
            const hasReferredBy = profiles && profiles.length > 0 && profiles[0].referred_by !== null;

            // 4. Calculate Valid Referrals (Users referred by this user who have approved deposits)
            let validReferrals = 0;
            const hasReferralMissions = missions.some(m => m.action_url && m.action_url.startsWith('#referral_'));
            if (hasReferralMissions) {
                const referredProfiles = await supabaseRequest(`/rest/v1/profiles?referred_by=eq.${userId}&select=id`, 'GET', null, true);
                if (referredProfiles && referredProfiles.length > 0) {
                    const referredIds = referredProfiles.map(p => p.id);
                    const depositStats = await supabaseRequest(`/rest/v1/deposit_requests?status=eq.approved&user_id=in.(${referredIds.join(',')})&select=user_id`, 'GET', null, true);
                    if (depositStats) {
                        const uniqueDonators = new Set(depositStats.map(d => d.user_id));
                        validReferrals = uniqueDonators.size;
                    }
                }
            }

            return res.status(200).json({
                success: true,
                missions: missions.map(m => ({
                    ...m,
                    is_completed: m.action_url === '#enter_referral' ? hasReferredBy : completedIds.includes(m.id)
                })),
                checkinState: {
                    is_completed: hasCheckedIn
                },
                validReferrals: validReferrals
            });
        }

        if (req.method === 'GET' && action === 'transactions') {
            const txs = await supabaseRequest(`/rest/v1/xu_transactions?user_id=eq.${userId}&order=created_at.desc&limit=50`, 'GET', null, true);
            const mappedTxs = (txs || []).map(tx => {
                let desc = tx.description || 'Giao dịch xu';
                if (desc.includes('Luận quẻ bằng model') || desc.includes('Luận giải quẻ tự động') || desc.includes('Luận giải quẻ')) {
                    desc = 'Luận giải tự động';
                }
                desc = desc.replace(/nạp xu/gi, 'donate').replace(/nập xu/gi, 'donate');
                desc = desc.replace(/Duyệt nạp xu/gi, 'Duyệt donate');
                return {
                    ...tx,
                    description: desc
                };
            });
            return res.status(200).json({ success: true, data: mappedTxs });
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


        if (req.method === 'POST' && action === 'enter_referral') {
            const { referral_code } = req.body;
            if (!referral_code) return res.status(400).json({ error: 'Mã giới thiệu không hợp lệ' });

            const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=referred_by,xu_balance`, 'GET', null, false, { Authorization: `Bearer ${token}` });
            if (!profiles || profiles.length === 0) return res.status(404).json({ error: 'Profile not found' });
            if (profiles[0].referred_by) return res.status(400).json({ error: 'Bạn đã nhập mã giới thiệu trước đó rồi' });

            const targetProfiles = await supabaseRequest(`/rest/v1/profiles?referral_code=eq.${referral_code}&select=id`, 'GET', null, true);
            if (!targetProfiles || targetProfiles.length === 0) return res.status(404).json({ error: 'Mã giới thiệu không tồn tại' });
            
            const referrerId = targetProfiles[0].id;
            if (referrerId === userId) return res.status(400).json({ error: 'Bạn không thể tự giới thiệu chính mình' });

            const newXu = profiles[0].xu_balance + 5;
            await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { referred_by: referrerId, xu_balance: newXu }, true);
            
            await supabaseRequest('/rest/v1/xu_transactions', 'POST', {
                user_id: userId,
                amount: 5,
                type: 'referral_bonus',
                description: 'Thưởng nhập mã giới thiệu'
            }, true);

            return res.status(200).json({ success: true, message: 'Nhập mã thành công, bạn được cộng 5 xu!' });
        }

        if (req.method === 'POST' && action === 'claim_referral') {
            const { mission_id, target } = req.body;
            if (!mission_id || !target) return res.status(400).json({ error: 'Thiếu thông tin' });

            // Ensure not already claimed
            const userMissions = await supabaseRequest(`/rest/v1/user_missions?user_id=eq.${userId}&mission_id=eq.${mission_id}&select=id`, 'GET', null, true);
            if (userMissions && userMissions.length > 0) return res.status(400).json({ error: 'Bạn đã nhận thưởng mốc này rồi' });

            // Count valid referrals
            const referredProfiles = await supabaseRequest(`/rest/v1/profiles?referred_by=eq.${userId}&select=id`, 'GET', null, true);
            if (!referredProfiles || referredProfiles.length === 0) return res.status(400).json({ error: 'Chưa đủ số lượng giới thiệu' });
            
            const referredIds = referredProfiles.map(p => p.id);
            const depositStats = await supabaseRequest(`/rest/v1/deposit_requests?status=eq.approved&user_id=in.(${referredIds.join(',')})&select=user_id`, 'GET', null, true);
            if (!depositStats) return res.status(400).json({ error: 'Chưa đủ số lượng giới thiệu' });
            
            const uniqueDonators = new Set(depositStats.map(d => d.user_id));
            if (uniqueDonators.size < target) return res.status(400).json({ error: `Bạn cần ${target} lượt giới thiệu hợp lệ (người dùng nạp tiền) để nhận thưởng.` });

            // Grant reward
            const missionData = await supabaseRequest(`/rest/v1/missions?id=eq.${mission_id}&select=reward`, 'GET', null, true);
            const reward = missionData[0].reward;

            const myProfile = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=xu_balance`, 'GET', null, true);
            await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { xu_balance: myProfile[0].xu_balance + reward }, true);
            
            await supabaseRequest('/rest/v1/user_missions', 'POST', {
                user_id: userId,
                mission_id: mission_id
            }, true);

            await supabaseRequest('/rest/v1/xu_transactions', 'POST', {
                user_id: userId,
                amount: reward,
                type: 'mission_reward',
                description: `Thưởng mốc giới thiệu ${target} người`
            }, true);

            return res.status(200).json({ success: true, message: `Nhận thành công ${reward} xu!` });
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
