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
    // Xử lý callback từ Google Auth (nếu có)
    if (window.location.hash.includes('access_token=')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const token = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (token) {
            setToken(token, refreshToken);
            history.replaceState(null, null, ' '); // Xóa hash trên URL cho đẹp
        }
    }
    
    initAuth();
    
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

function setToken(token, refreshToken = null) {
    if (token) localStorage.setItem('sa_token', token);
    else localStorage.removeItem('sa_token');
    
    if (refreshToken) localStorage.setItem('sa_refresh', refreshToken);
    else if (!token) localStorage.removeItem('sa_refresh');
    
    currentToken = token;
}

async function initAuth() {
    const token = getToken();
    if (!token) {
        updateAuthUI(null);
        return;
    }
    
    try {
        let res = await fetch('/api/auth?action=profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // If unauthorized, try to refresh
        if (res.status === 401 || res.status === 403 || !res.ok) {
            const refreshToken = localStorage.getItem('sa_refresh');
            if (refreshToken) {
                const refreshRes = await fetch('/api/auth?action=refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken })
                });
                const refreshData = await refreshRes.json();
                if (refreshData.success && refreshData.data && refreshData.data.access_token) {
                    setToken(refreshData.data.access_token, refreshData.data.refresh_token);
                    // Retry profile fetch
                    res = await fetch('/api/auth?action=profile', {
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                }
            }
        }

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
    const xuAmount = document.getElementById('xuAmount');
    const checkinBtn = document.getElementById('btnCheckin');

    if (user) {
        if (document.getElementById('btnSignup')) document.getElementById('btnSignup').style.display = 'none';
        if (document.getElementById('btnZaloAuth')) document.getElementById('btnZaloAuth').style.display = 'none';
        document.getElementById('btnLogin').style.display = 'none';
        document.getElementById('userMenu').style.display = 'flex';
        
        let displayEmail = user.email || user.id;
        if (displayEmail.endsWith('@gieoque.id.vn')) {
            displayEmail = displayEmail.replace('@gieoque.id.vn', '');
        } else if (displayEmail.endsWith('@luchao.io.vn')) {
            displayEmail = displayEmail.replace('@luchao.io.vn', '');
        }
        document.getElementById('userName').textContent = displayEmail;
        
        document.getElementById('xuAmount').textContent = user.xu_balance;
        
        // Cập nhật nút Luận giải nếu đang hiển thị
        updateDivineButton();
        
        // Kiểm tra xem đã điểm danh hôm nay chưa
        const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        const todayStr = today.toISOString().split('T')[0];
        if (user.last_checkin !== todayStr && checkinBtn) {
            checkinBtn.style.animation = 'pulse 1.5s infinite';
            checkinBtn.style.display = 'inline-flex';
        } else if (checkinBtn) {
            checkinBtn.style.display = 'none';
        }

        // Cập nhật Referral Code
        const refBox = document.getElementById('referralCodeBox');
        const refCode = document.getElementById('myReferralCode');
        if (user.referral_code && refBox && refCode) {
            refCode.innerText = user.referral_code;
            refBox.style.display = 'block';
        }
    } else {
        if (btnLogin) btnLogin.style.display = 'inline-block';
        if (btnSignup) btnSignup.style.display = 'inline-block';
        const btnZaloAuth = document.getElementById('btnZaloAuth');
        if (btnZaloAuth) btnZaloAuth.style.display = 'inline-flex';
        if (userMenu) userMenu.style.display = 'none';
        if (checkinBtn) checkinBtn.style.display = 'none';
        updateDivineButton();
    }
}

function showAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    const form = document.getElementById('authForm');
    
    // Reset any old submit handlers
    form.onsubmit = (e) => e.preventDefault();
    
    form.innerHTML = `
        <h3 style="text-align: center; margin-bottom: 20px;">Đăng Nhập Hệ Thống</h3>
        <p style="text-align: center; margin-bottom: 20px; color: #666;">Đăng nhập bằng tài khoản Google của bạn để trải nghiệm tính năng gieo quẻ và điểm danh nhận xu mỗi ngày!</p>
        <button type="button" class="btn-submit" onclick="loginWithGoogle()" style="background-color: #ea4335; color: white; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; border-radius: 8px; padding: 12px; font-weight: bold; border: none; cursor: pointer;">
            <svg style="width: 24px; height: 24px;" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Tiếp tục với Google
        </button>
    `;
    
    modal.style.display = 'flex';
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function loginWithGoogle() {
    if (typeof saveDivinationState === 'function') {
        saveDivinationState();
    }
    const supabaseUrl = 'https://solgyybbukgeggqsxnxx.supabase.co';
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirectUri}`;
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

function updateDivineButton() {
    const btn = document.getElementById('btnAutoDivine');
    const textSpan = document.getElementById('btnAutoDivineText');
    if (!btn || !textSpan) return;
    
    // Ensure button is visible when this runs
    btn.style.display = 'flex';
    
    const cost = 5;
    selectedModelId = 'gemini-3.1-flash-lite';
    
    if (!currentUser) {
        textSpan.innerHTML = 'Đăng nhập để luận giải tự động';
        btn.onclick = () => showAuthModal('login');
        return;
    }
    
    if (currentXu < cost) {
        textSpan.innerHTML = `Không Đủ Xu (${cost} xu)`;
        btn.disabled = true;
    } else {
        textSpan.innerHTML = `Luận Giải Tự Động (${cost} xu)`;
        btn.disabled = false;
        btn.onclick = startAIDivination;
    }
}

function generateHexagramText() {
    if (!window.currentHexData) return null;
    const data = window.currentHexData;
    const { mainName, changedName, linesData, movingLines, dateInfo, changedAttr, mainAttr } = data;

    let text = "Bạn là Đại sư Kinh Dịch với nhiều năm kinh nghiệm luận quẻ Lục Hào theo phương pháp Chu Thần Bân. Hãy phân tích và luận giải quẻ dịch dưới đây:\n\n";
    text += "- Nhật Lệnh: [" + dateInfo.nhatThan + "]; Nguyệt Lệnh: [" + dateInfo.nguyetLenh + "]\n";

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
    
    const question = document.getElementById('preTossQuestion').value.trim();
    if (!question) {
        alert("Vui lòng nhập câu hỏi của bạn để quá trình luận giải chính xác nhất!");
        return;
    }
    
    // Disable button & show loading
    const btn = document.getElementById('btnAutoDivine');
    if (btn) btn.disabled = true;
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
            
            // Cập nhật badge model đã dùng (đã xóa badge trên UI nên không cần thiết)
            // const badge = document.getElementById('aiModelBadge');
            // if (badge) badge.textContent = "Luận Giải Tự Động";
            
            // Show result
            document.getElementById('aiResult').style.display = 'block';
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
    
    const steps = [
        { id: "BƯỚC 1", title: "THỰC CHỨNG ĐỐI QUỸ", icon: "🔍", color: "#3498db" },
        { id: "BƯỚC 2", title: "XÁC ĐỊNH DỤNG THẦN", icon: "🎯", color: "#e67e22" },
        { id: "BƯỚC 3", title: "LUẬN CÁT HUNG VÀ ỨNG KỲ", icon: "⚖️", color: "#e74c3c" },
        { id: "BƯỚC 4", title: "LỜI KHUYÊN VÀ CHI TIẾT", icon: "💡", color: "#2ecc71" }
    ];
    
    // Better Markdown to HTML - handle bullets as block-level list items
    let htmlContent = markdownText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert markdown bullet lines into proper HTML list items
    // Split by newline, process each line
    let lines = htmlContent.split('\n');
    let processedLines = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('- ') || line.startsWith('• ')) {
            if (!inList) {
                processedLines.push('<ul class="ai-bullet-list">');
                inList = true;
            }
            processedLines.push('<li>' + line.substring(2) + '</li>');
        } else {
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            if (line === '') {
                processedLines.push('<br>');
            } else {
                processedLines.push('<p>' + line + '</p>');
            }
        }
    }
    if (inList) processedLines.push('</ul>');
    
    htmlContent = processedLines.join('\n');
    
    let currentHtml = htmlContent;
    
    steps.forEach((step, idx) => {
        const nextStepId = steps[idx+1] ? steps[idx+1].id : "KHONG_CO_BUOC_NAY";
        
        const regex = new RegExp(`(##\\s*${step.id}[\\s\\S]*?)(?=(##\\s*BƯỚC \\d+|$))`, 'i');
        const match = currentHtml.match(regex);
        
        let stepContent = match ? match[1] : '';
        // Clean step title from content
        stepContent = stepContent.replace(new RegExp(`##\\s*${step.id}[^\\n<]*(<br>|<\\/p>|<p>|\\n)?`, 'i'), '');
        stepContent = stepContent.replace(new RegExp(`<p>\\s*:?\\s*${step.title}\\s*:?\\s*</p>`, 'i'), '');
        
        if (stepContent.trim() !== '') {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'ai-step-card';
            stepDiv.style.borderLeftColor = step.color;
            stepDiv.innerHTML = `
                <div class="ai-step-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <h4>${step.icon} ${step.title}</h4>
                    <span class="ai-step-toggle">▼</span>
                </div>
                <div class="ai-step-content">${stepContent}</div>
            `;
            resultBody.appendChild(stepDiv);
        }
    });
    
    // Fallback nếu AI trả về không theo chuẩn
    if (resultBody.children.length === 0) {
        resultBody.innerHTML = `<div class="ai-step-content" style="padding: 15px;">${htmlContent}</div>`;
    }
    
    document.getElementById('aiResult').style.display = 'block';
    // Scroll
    setTimeout(() => {
        document.getElementById('aiResult').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

// Tính năng tải ảnh kết quả luận giải (cùng logic mobile như downloadImage)
async function downloadAIResultImage() {
    if (typeof html2canvas === 'undefined') {
        alert("Thư viện chụp ảnh chưa được tải. Vui lòng thử lại sau.");
        return;
    }
    
    const resultContainer = document.getElementById('aiResult');
    if (!resultContainer) return;

    // Tạm thời mở rộng tất cả các thẻ accordion để chụp đủ chữ
    const headers = resultContainer.querySelectorAll('.ai-step-header');
    headers.forEach(h => h.parentElement.classList.remove('collapsed'));

    // Ẩn nút tải ảnh trong lúc chụp
    const btnDownload = resultContainer.querySelector('.btn-download-img');
    if (btnDownload) btnDownload.style.display = 'none';

    try {
        const canvas = await html2canvas(resultContainer, {
            backgroundColor: '#0f172a',
            scale: 2,
            useCORS: true,
            logging: false
        });

        const imageDataUrl = canvas.toDataURL('image/png');
        const filename = `Luan_Giai_Luc_Hao_${new Date().getTime()}.png`;
        
        var ua = navigator.userAgent || '';
        var isInApp = /FBAN|FBAV|FB_IAB|Zalo|ZaloTheme|Instagram|Line|MicroMessenger|Snapchat|Twitter|TikTok/i.test(ua);
        var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

        if (isInApp && typeof showInAppGuide === 'function') {
            showInAppGuide();
        } else if (isIOS && navigator.share) {
            try {
                // Convert base64 data URL directly to Blob (fixes iOS Safari fetch size limit bug)
                const parts = imageDataUrl.split(',');
                const mime = parts[0].match(/:(.*?);/)[1];
                const bstr = atob(parts[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], { type: mime });
                const file = new File([blob], filename, { type: 'image/png' });
                const shareData = { files: [file] };
                
                navigator.share(shareData).catch(err => {
                    console.log('Share error', err);
                    if (typeof fallbackDownload === 'function') fallbackDownload(imageDataUrl, filename);
                });
            } catch (e) {
                console.error('Manual blob conversion failed:', e);
                if (typeof fallbackDownload === 'function') fallbackDownload(imageDataUrl, filename);
            }
        } else if (typeof fallbackDownload === 'function') {
            fallbackDownload(imageDataUrl, filename);
        } else {
            // Inline fallback nếu fallbackDownload chưa có
            const link = document.createElement('a');
            link.download = filename;
            link.href = imageDataUrl;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 200);
        }
    } catch (error) {
        console.error("Lỗi khi tạo ảnh luận giải:", error);
        alert("Có lỗi xảy ra khi tạo ảnh. Vui lòng thử lại.");
    } finally {
        // Hiện lại nút tải ảnh
        if (btnDownload) btnDownload.style.display = 'flex';
    }
}

// Close dropdown when clicking outside
window.addEventListener('click', function(e) {
    const dropdownMenu = document.getElementById('userDropdownMenu');
    const dropdownTrigger = document.querySelector('.dropdown-trigger');
    if (dropdownMenu && dropdownTrigger) {
        if (!dropdownTrigger.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownMenu.classList.remove('show');
        }
    }
});

