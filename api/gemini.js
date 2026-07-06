const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://solgyybbukgeggqsxnxx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_fIqAdNcP094vgyCNViVkwQ_7cRdHsgo';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // MUST be set in Vercel Environment Variables

// Headers cho CORS
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Hàm gửi request tới Supabase REST API
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
        throw new Error(`Supabase Error (${res.status}): ${err}`);
    }
    // Handle 204 No Content and empty 201 Created
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).send('ok');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Xác thực User qua token
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Missing Authorization header' });
        }

        const token = authHeader.replace('Bearer ', '').trim();
        let user;
        try {
            // Xác thực token bằng cách gọi Supabase Auth API
            const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
            });
            if (!userRes.ok) throw new Error('Invalid token');
            user = await userRes.json();
        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        const userId = user.id;
        const { hexagramText, question, modelId, idempotencyKey } = req.body;

        if (!hexagramText || !modelId || !idempotencyKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 2. Kiểm tra Idempotency (Chống gọi 2 lần)
        const historyRes = await supabaseRequest(`/rest/v1/divination_history?idempotency_key=eq.${idempotencyKey}&select=*`);
        if (historyRes && historyRes.length > 0) {
            // Đã luận rồi, trả về kết quả cũ luôn
            return res.status(200).json({
                success: true,
                result: historyRes[0].ai_response,
                xuCost: historyRes[0].xu_cost,
                isCached: true
            });
        }

        // 3. Lấy cấu hình models & api_keys từ DB
        const configRes = await supabaseRequest(`/rest/v1/ai_config?config_key=in.(models,api_keys)&select=*`);
        let modelsConfig = [];
        let apiKeys = [];
        
        for (const item of configRes) {
            if (item.config_key === 'api_keys') apiKeys = item.config_value.filter(k => k && k.trim().length > 10);
        }

        // Hardcode models config to ensure consistency with frontend
        modelsConfig = [
            {id: "gemini-3.1-flash-lite", name: "Cơ Bản", xuCost: 5, enabled: true},
            {id: "gemini-2.5-flash-lite", name: "Tiêu Chuẩn", xuCost: 10, enabled: true},
            {id: "gemini-2.5-flash", name: "Chi Tiết", xuCost: 15, enabled: true},
            {id: "gemini-3-flash", name: "Chuyên Sâu", xuCost: 20, enabled: true},
            {id: "gemini-3.5-flash", name: "Đại Sư", xuCost: 30, enabled: true}
        ];

        if (apiKeys.length === 0) {
            return res.status(500).json({ error: 'Hệ thống chưa cấu hình API Key' });
        }

        const modelConfig = modelsConfig.find(m => m.id === modelId);
        if (!modelConfig) {
            return res.status(400).json({ error: 'Model không tồn tại' });
        }
        if (!modelConfig.enabled) {
            return res.status(400).json({ error: 'Model này đang tạm khóa' });
        }

        const cost = modelConfig.xuCost;

        // 4. Kiểm tra và Trừ Xu
        // Lấy xu hiện tại
        const profileRes = await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}&select=xu_balance`);
        if (!profileRes || profileRes.length === 0) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        
        let currentXu = profileRes[0].xu_balance;
        if (currentXu < cost) {
            return res.status(403).json({ error: `Không đủ xu. Bạn cần ${cost} xu, hiện có ${currentXu} xu.` });
        }

        // Trừ xu
        await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', {
            xu_balance: currentXu - cost
        });

        // 5. Chuẩn bị Prompt
        // Đọc file kiến thức
        let kienthuc = "";
        try {
            const filePath = path.join(process.cwd(), 'kienthuc.md');
            kienthuc = fs.readFileSync(filePath, 'utf8');
        } catch (e) {
            console.error("Lỗi đọc file kienthuc.md:", e);
            kienthuc = "Lỗi: Không tìm thấy tài liệu kiến thức.";
        }

        let fullPrompt = `${hexagramText}${question ? ("\n\nCâu hỏi: " + question) : ""}\n\n---\nKiến thức tham khảo:\n${kienthuc}`;

        // 6. Gọi Gemini API (Có xoay vòng Key)
        let aiResultText = null;
        let success = false;
        let lastError = null;
        let usedKeyIndex = 0;

        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
                const payload = {
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        topP: 0.8,
                        topK: 40,
                        maxOutputTokens: 8192 // Rút bớt token cho an toàn timeout
                    }
                };

                // Fetch có timeout (Vercel max 60s, set 50s để kịp xử lý lỗi)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 50000);
                
                const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                const geminiJson = await geminiRes.json();

                if (!geminiRes.ok) {
                    if (geminiRes.status === 429 || (geminiJson.error && geminiJson.error.message.includes('quota'))) {
                        lastError = 'Quota exceeded';
                        // Ghi log lỗi
                        await supabaseRequest('/rest/v1/api_usage_log', 'POST', {
                            api_key_index: i,
                            model_id: modelId,
                            success: false,
                            error_code: '429'
                        }).catch(e=>console.error(e));
                        
                        continue; // Thử key tiếp theo
                    } else {
                        throw new Error(geminiJson.error?.message || 'Lỗi Gemini API');
                    }
                }

                aiResultText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!aiResultText) throw new Error("Empty response from AI");
                
                success = true;
                usedKeyIndex = i;
                
                // Ghi log thành công
                await supabaseRequest('/rest/v1/api_usage_log', 'POST', {
                    api_key_index: i,
                    model_id: modelId,
                    success: true,
                    error_code: null
                }).catch(e=>console.error(e));
                
                break; // Thành công thì thoát vòng lặp
            } catch (err) {
                console.error(`Lỗi với Key ${i}:`, err.message);
                lastError = err.message;
                // Nếu không phải 429 mà là lỗi khác (như timeout), dừng luôn không vòng lặp nữa để tránh treo
                if (err.name === 'AbortError') {
                    lastError = 'Timeout 50s';
                    break;
                }
            }
        }

        // 7. Xử lý kết quả
        if (!success) {
            // Hoàn xu
            await supabaseRequest(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', {
                xu_balance: currentXu // Trả lại số xu ban đầu
            });
            
            return res.status(500).json({ 
                error: lastError === 'Quota exceeded' 
                    ? 'Model này tạm thời hết lượt (Quota exceeded). Vui lòng chọn model khác!'
                    : `Lỗi AI: ${lastError}. Đã hoàn lại xu.` 
            });
        }

        // 8. Lưu lịch sử & Giao dịch xu
        await supabaseRequest('/rest/v1/divination_history', 'POST', {
            user_id: userId,
            hexagram_text: hexagramText,
            question: question || '',
            model_used: modelId,
            ai_response: aiResultText,
            xu_cost: cost,
            idempotency_key: idempotencyKey
        });

        await supabaseRequest('/rest/v1/xu_transactions', 'POST', {
            user_id: userId,
            amount: -cost,
            type: 'ai_usage',
            description: `Luận quẻ bằng model ${modelId}`
        });

        return res.status(200).json({
            success: true,
            result: aiResultText,
            xuCost: cost,
            xuRemaining: currentXu - cost
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
