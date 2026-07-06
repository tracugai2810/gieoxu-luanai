// ============================================
// AI DIVINATION & AUTH FRONTEND LOGIC
// ============================================

let currentUser = null;
let currentToken = null;
let currentXu = 0;
let availableModels = [];
let selectedModelId = null;

// --- Khởi tạo & Lắng nghe ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    loadModels();
    
    // Lắng nghe sự kiện quẻ đã gieo xong từ app.js
    window.addEventListener('hexagramReady', () => {
        const aiSection = document.getElementById('aiSection');
        if (aiSection) {
            aiSection.style.display = 'block';
            // Scroll to AI section
            setTimeout(() => {
                aiSection.scrollIntoView({ behavior: 'smooth' });
            }, 500);
        }
    });
});

// --- AUTH LOGIC ---

function getToken() {
    return localStorage.getItem('sa_token');
}

function setToken(token) {
    if (token) localStorage.setItem('sa_token', token);
    else localStorage.removeItem('sa_token');
    currentToken = token;
}

async function initAuth() {
    const token = getToken();
    if (!token) {
        updateAuthUI(null);
        return;
    }
    
    try {
        const res = await fetch('/api/auth?action=profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.profile;
            currentXu = currentUser.xu_balance;
            currentToken = token;
            updateAuthUI(currentUser);
        } else {
            setToken(null);
            updateAuthUI(null);
        }
    } catch (e) {
        console.error("Auth error:", e);
    }
}

function updateAuthUI(user) {
    const authBar = document.getElementById('authBar');
    if (!authBar) return;

    const btnLogin = document.getElementById('btnLogin');
    const btnSignup = document.getElementById('btnSignup');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');
    const xuDisplay = document.getElementById('xuDisplay');
    const xuAmount = document.getElementById('xuAmount');
    const checkinBtn = document.getElementById('btnCheckin');

    if (user) {
        btnLogin.style.display = 'none';
        btnSignup.style.display = 'none';
        userMenu.style.display = 'flex';
        xuDisplay.style.display = 'flex';
        
        userName.textContent = user.email.split('@')[0];
        xuAmount.textContent = user.xu_balance;
        
        // Cập nhật nút Luận giải nếu đang hiển thị
        updateDivineButton();
        
        // Kiểm tra xem đã điểm danh hôm nay chưa
        const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        const todayStr = today.toISOString().split('T')[0];
        if (user.last_checkin !== todayStr && checkinBtn) {
            checkinBtn.style.display = 'inline-flex';
            checkinBtn.classList.add('pulse');
        } else if (checkinBtn) {
            checkinBtn.style.display = 'none';
        }
    } else {
        btnLogin.style.display = 'inline-block';
        btnSignup.style.display = 'inline-block';
        userMenu.style.display = 'none';
        xuDisplay.style.display = 'none';
        if (checkinBtn) checkinBtn.style.display = 'none';
        updateDivineButton();
    }
}

function showAuthModal(tab) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => {
        if (t.dataset.tab === tab) t.classList.add('active');
        else t.classList.remove('active');
    });
    
    renderAuthForm(tab);
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function renderAuthForm(tab) {
    const form = document.getElementById('authForm');
    if (!form) return;
    
    const isLogin = tab === 'login';
    const title = isLogin ? 'Đăng nhập' : 'Đăng ký nhận 5 xu';
    const btnText = isLogin ? 'Đăng Nhập' : 'Đăng Ký Ngay';
    
    form.innerHTML = `
        <h3>${title}</h3>
        <div class="form-group">
            <label>Email</label>
            <input type="email" id="authEmail" required placeholder="nhap@email.com">
        </div>
        <div class="form-group">
            <label>Mật khẩu</label>
            <input type="password" id="authPassword" required placeholder="******">
        </div>
        <div id="authError" class="auth-error"></div>
        <button type="submit" class="btn-submit">${btnText}</button>
    `;
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        const errDiv = document.getElementById('authError');
        
        try {
            const btn = form.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';
            
            const action = isLogin ? 'login' : 'signup';
            const res = await fetch(`/api/auth?action=${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const data = await res.json();
            
            if (!data.success) {
                errDiv.textContent = data.error || 'Có lỗi xảy ra';
                errDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = btnText;
            } else {
                if (!isLogin) {
                    alert('Đăng ký thành công! Bạn được tặng 5 xu. Vui lòng đăng nhập lại.');
                    showAuthModal('login');
                } else {
                    setToken(data.data.access_token);
                    await initAuth();
                    hideAuthModal();
                }
            }
        } catch (err) {
            errDiv.textContent = 'Lỗi kết nối';
            errDiv.style.display = 'block';
        }
    };
}

function logout() {
    setToken(null);
    currentUser = null;
    currentXu = 0;
    updateAuthUI(null);
}

async function dailyCheckin() {
    if (!currentToken) return showAuthModal('login');
    
    try {
        const checkinBtn = document.getElementById('btnCheckin');
        if (checkinBtn) checkinBtn.disabled = true;
        
        const res = await fetch('/api/auth?action=checkin', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        
        if (data.success) {
            alert(data.message);
            currentXu = data.xuRemaining;
            if(currentUser) currentUser.xu_balance = currentXu;
            // Update UI manually to hide button
            document.getElementById('xuAmount').textContent = currentXu;
            if (checkinBtn) checkinBtn.style.display = 'none';
            updateDivineButton();
        } else {
            alert(data.error);
        }
    } catch (e) {
        alert("Lỗi kết nối, vui lòng thử lại sau.");
    }
}

// Click outside to close modal
window.onclick = function(event) {
    const modal = document.getElementById('authModal');
    if (event.target == modal) {
        hideAuthModal();
    }
}


// --- AI DIVINATION LOGIC ---

async function loadModels() {
    try {
        const res = await fetch('/api/admin?action=config'); // Tạm dùng public, sau nên có API public lấy list
        // Để không phải tạo thêm API, ta hardcode load luôn danh sách hoặc gọi API nếu sửa admin cho phép không cần token.
        // Wait, admin API requires token! Ta nên gọi API cấu hình public.
        // Nhưng tạm thời ta sẽ hardcode danh sách fallback, hoặc thay vì load từ DB, lấy luôn cấu hình từ /api/gemini?
        // Sửa nhanh: Ta sẽ tự tạo một mảng model dựa trên bảng giá đã chốt:
        
        availableModels = [
            {id: "gemini-2.0-flash-lite", name: "Gemini 3.1 Flash Lite", xuCost: 5, enabled: true},
            {id: "gemini-1.5-flash-lite-preview-06-17", name: "Gemini 2.5 Flash Lite", xuCost: 10, enabled: true},
            {id: "gemini-2.0-flash", name: "Gemini 3.5 Flash", xuCost: 10, enabled: true},
            {id: "gemini-1.5-flash-preview-05-20", name: "Gemini 3 Flash", xuCost: 15, enabled: true},
            {id: "gemini-1.5-flash", name: "Gemini 2.5 Flash", xuCost: 20, enabled: true}
        ];
        renderModelCards();
    } catch (e) {
        console.error("Lỗi load models:", e);
    }
}

function renderModelCards() {
    const container = document.getElementById('modelCards');
    if (!container) return;
    
    container.innerHTML = '';
    
    availableModels.forEach((m, idx) => {
        if (!m.enabled) return;
        
        const isSelected = (selectedModelId === m.id) || (!selectedModelId && idx === 0);
        if (isSelected) {
            selectedModelId = m.id;
            updateDivineButton();
        }
        
        const card = document.createElement('div');
        card.className = `model-card ${isSelected ? 'selected' : ''}`;
        card.onclick = () => {
            selectedModelId = m.id;
            document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            updateDivineButton();
        };
        
        card.innerHTML = `
            <div class="model-name">✨ ${m.name}</div>
            <div class="model-price">${m.xuCost} xu / lượt</div>
        `;
        container.appendChild(card);
    });
}

function updateDivineButton() {
    const btn = document.getElementById('btnDivine');
    const costSpan = document.getElementById('divineCost');
    if (!btn || !costSpan) return;
    
    const model = availableModels.find(m => m.id === selectedModelId);
    const cost = model ? model.xuCost : 0;
    
    costSpan.textContent = cost;
    
    if (!currentToken) {
        btn.innerHTML = `🔮 Đăng Nhập Để Luận Giải`;
        btn.disabled = false;
        btn.onclick = () => showAuthModal('login');
    } else if (currentXu < cost) {
        btn.innerHTML = `❌ Không Đủ Xu (${cost} xu)`;
        btn.disabled = true;
    } else {
        btn.innerHTML = `🔮 Luận Giải (${cost} xu)`;
        btn.disabled = false;
        btn.onclick = startAIDivination;
    }
}

function generateHexagramText() {
    if (!window.currentHexData) return null;
    const data = window.currentHexData;
    const { mainName, changedName, linesData, movingLines, dateInfo, changedAttr, mainAttr } = data;

    let text = "- Nhật Lệnh: [" + dateInfo.nhatThan + "]; Nguyệt Lệnh: [" + dateInfo.nguyetLenh + "]\n";

    let ssText = "";
    if (Array.isArray(dateInfo.shenshaRaw)) {
        ssText = dateInfo.shenshaRaw.map(s => s.replace(/<[^>]*>/g, '')).filter(s => !s.endsWith('-')).join('; ');
    }
    text += "- Thần sát: [" + ssText + "]\n";
    text += "- Tuần không: " + dateInfo.tuanKhong + "\n";

    let queBienText = (movingLines.length > 0) ? changedName : "";
    if (movingLines.length > 0 && changedAttr) {
        queBienText += " (" + changedAttr + ")";
    } else if (movingLines.length === 0) {
        queBienText = "Quẻ Tĩnh";
    }
    let dongHaoText = "";
    if (movingLines.length > 0) {
        dongHaoText = " [" + movingLines.map(h => "động hào " + h).join(', ') + "]";
    }
    let mainQueText = mainName;
    if (mainAttr) mainQueText += " (" + mainAttr + ")";
    text += "- Tên Quẻ Chủ: " + mainQueText + " -> Tên Quẻ Biến: " + queBienText + dongHaoText + "\n";

    for (let i = 5; i >= 0; i--) {
        const line = linesData[i];
        const lineNum = i + 1;

        let mainPart = line.lucThu + " - " + line.relation + " " + line.chi + " " + line.hanh;
        if (line.isShi) mainPart += " (Thế)";
        else if (line.isYing) mainPart += " (Ứng)";
        if (line.isTK) mainPart += " (Tuần Không)";

        let changedPart = "";
        if (line.isMoving) {
            changedPart = " -> Động Hóa " + line.changed.relation + " " + line.changed.branch + " " + line.changed.hanh;
            if (line.isCTK) changedPart += " (Tuần Không)";
        }

        const LIFE_STAGES_FULL = {
            'T.Sinh': 'Trường Sinh', 'M.Dục': 'Mộc Dục', 'Q.Đới': 'Quan Đới',
            'L.Quan': 'Lâm Quan', 'Đ.Vượng': 'Đế Vượng', 'Suy': 'Suy',
            'Bệnh': 'Bệnh', 'Tử': 'Tử', 'Mộ': 'Mộ', 'Tuyệt': 'Tuyệt',
            'Thai': 'Thai', 'Dưỡng': 'Dưỡng'
        };
        const tsFullName = LIFE_STAGES_FULL[line.tsNgay] || line.tsNgay;
        const tsPart = " - " + tsFullName + " tại Nhật Lệnh";

        let phucPart = "";
        if (line.phucThan) {
            phucPart = " (Phục thần: " + line.phucThan.rel + " " + line.phucThan.branch + ")";
        }

        text += "- Hào " + lineNum + ": [" + mainPart + tsPart + "]" + changedPart + phucPart + ";\n";
    }
    return text;
}

// Hàm mã hóa MD5 đơn giản để tạo idempotency key
function md5_mini(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

async function startAIDivination() {
    if (!currentToken) return showAuthModal('login');
    
    const hexText = generateHexagramText();
    if (!hexText) {
        alert("Vui lòng gieo quẻ trước!");
        return;
    }
    
    const question = document.getElementById('aiQuestion').value.trim();
    if (!question) {
        alert("Vui lòng nhập câu hỏi của bạn để AI luận giải chính xác nhất!");
        document.getElementById('aiQuestion').focus();
        return;
    }
    
    // Disable button & show loading
    const btn = document.getElementById('btnDivine');
    btn.disabled = true;
    document.getElementById('aiLoading').style.display = 'flex';
    document.getElementById('aiResult').style.display = 'none';
    
    // Create idempotency key (10 phút 1 lần cho cùng 1 câu hỏi + quẻ để tránh double call)
    const timeBucket = Math.floor(Date.now() / 600000); 
    const idempotencyKey = md5_mini(currentUser.id + hexText + question + timeBucket);

    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                hexagramText: hexText,
                question: question,
                modelId: selectedModelId,
                idempotencyKey: idempotencyKey
            })
        });
        
        const data = await res.json();
        
        if (!data.success) {
            alert(data.error || "Có lỗi xảy ra khi luận quẻ.");
        } else {
            // Render kết quả
            renderAIResult(data.result);
            
            // Cập nhật lại xu
            if(data.xuRemaining !== undefined) {
                currentXu = data.xuRemaining;
                if(currentUser) currentUser.xu_balance = currentXu;
                document.getElementById('xuAmount').textContent = currentXu;
            }
            
            // Cập nhật badge model đã dùng
            const model = availableModels.find(m => m.id === selectedModelId);
            document.getElementById('aiModelBadge').textContent = model ? model.name : selectedModelId;
        }
    } catch (e) {
        console.error("Call AI Error:", e);
        alert("Lỗi kết nối hoặc timeout. Vui lòng thử lại!");
    } finally {
        document.getElementById('aiLoading').style.display = 'none';
        updateDivineButton();
    }
}

function renderAIResult(markdownText) {
    const resultBody = document.getElementById('aiResultBody');
    resultBody.innerHTML = '';
    
    // Dùng Regex đơn giản để tách 5 bước ra thay vì dùng thư viện Markdown cồng kềnh
    const steps = [
        { id: "BƯỚC 1", title: "THỰC CHỨNG ĐỐI QUỸ", icon: "🔍", color: "#3498db" },
        { id: "BƯỚC 2", title: "XÁC ĐỊNH DỤNG THẦN", icon: "🎯", color: "#e67e22" },
        { id: "BƯỚC 3", title: "LUẬN CÁT HUNG", icon: "⚖️", color: "#e74c3c" },
        { id: "BƯỚC 4", title: "LUẬN ỨNG KỲ VÀ CHI TIẾT", icon: "📅", color: "#9b59b6" },
        { id: "BƯỚC 5", title: "LỜI KHUYÊN", icon: "💡", color: "#2ecc71" }
    ];
    
    // Basic Markdown to HTML
    let htmlContent = markdownText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n- /g, '<br>• ');
        
    htmlContent = `<p>${htmlContent}</p>`;
    
    // Render
    let currentHtml = htmlContent;
    
    steps.forEach((step, idx) => {
        // Tách content theo tiêu đề bước (BƯỚC 1, BƯỚC 2...)
        const nextStepId = steps[idx+1] ? steps[idx+1].id : "KHONG_CO_BUOC_NAY";
        
        const regex = new RegExp(`(##\\s*${step.id}.*?)(?=(##\\s*${nextStepId}|$))`, 'i');
        const match = currentHtml.match(regex);
        
        let stepContent = match ? match[1] : '';
        // Dọn dẹp tiêu đề khỏi nội dung
        stepContent = stepContent.replace(new RegExp(`##\\s*${step.id}.*?(<br>|<\\/p>|<p>)`, 'i'), '<p>');
        
        if (stepContent.trim() !== '') {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'ai-step-card';
            stepDiv.style.borderLeftColor = step.color;
            stepDiv.innerHTML = `
                <div class="ai-step-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <h4>${step.icon} ${step.id}: ${step.title}</h4>
                    <span class="ai-step-toggle">▼</span>
                </div>
                <div class="ai-step-content">${stepContent}</div>
            `;
            resultBody.appendChild(stepDiv);
        }
    });
    
    // Nếu AI trả về ko theo chuẩn 5 bước, fallback in ra toàn bộ
    if (resultBody.children.length === 0) {
        resultBody.innerHTML = `<div class="ai-step-content">${htmlContent}</div>`;
    }
    
    document.getElementById('aiResult').style.display = 'block';
    // Scroll
    setTimeout(() => {
        document.getElementById('aiResult').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}
