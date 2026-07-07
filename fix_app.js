const fs = require('fs');

const content = fs.readFileSync('app.js', 'utf8');
const searchString = 'Animation ends at rotateY(3600deg) = 10 full spins';
const lines = content.split('\n');

let idx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchString)) {
        idx = i;
        break;
    }
}

if (idx !== -1) {
    const keepLines = lines.slice(0, idx + 1);
    const textToKeep = keepLines.join('\n');
    const newContent = textToKeep + `
            const isYang = coinResults[index];
            const finalAngle = 3600 + (isYang ? 0 : 180);
            coin.style.transform = \`rotateY(\${finalAngle}deg)\`;
        });

        // Update Results UI with visual hexagram line
        addResultToStack(currentTossIndex, lineText, lineSymbol, isMoving, isYangLine);

        // Update progress bar
        const progressFill = document.getElementById('toss-progress-fill');
        if (progressFill) progressFill.style.width = \`\${(currentTossIndex / 6) * 100}%\`;

        // Prepare next step
        currentTossIndex++;

        if (currentTossIndex <= 6) {
            tossBtn.innerHTML = \`Gieo Hào \${currentTossIndex}\`;
            tossBtn.disabled = false;
            document.getElementById('toss-status').innerText = \`Hào \${currentTossIndex} / 6\`;
        } else {
            tossBtn.style.display = 'none';
            document.getElementById('toss-status').innerText = 'Đã gieo xong 6 hào!';
            // Auto finish toss immediately
            setTimeout(() => {
                finishTossSequence();
            }, 300);
        }

    }, 2000);
}

function addResultToStack(index, text, symbol, isMoving, isYang) {
    const container = document.getElementById('toss-results-list');
    const row = document.createElement('div');
    row.className = \`hex-line-result \${isMoving ? 'moving' : ''}\`;

    const lineType = isYang ? 'yang-line' : 'yin-line';
    const movingClass = isMoving ? 'moving-line' : '';
    const descText = isMoving ? (isYang ? 'Dương Động' : 'Âm Động') : (isYang ? 'Dương Tĩnh' : 'Âm Tĩnh');

    row.innerHTML = \`
        <span class="hex-num">\${index}</span>
        <div class="hex-visual \${lineType} \${movingClass}"></div>
        <span class="hex-desc">\${descText}</span>
    \`;
    container.appendChild(row);
}

function finishTossSequence() {
    // Populate Main Form from toss results
    tossResults.forEach((res, idx) => {
        const lineNum = idx + 1;
        const select = document.getElementById(\`line-\${lineNum}\`);
        const checkbox = document.getElementById(\`moving-\${lineNum}\`);

        if (!select || !checkbox) return;

        select.value = res.isYang ? 'yang' : 'yin';
        checkbox.checked = res.isMoving;
    });

    closeCoinTossModal();

    // Auto-process divination immediately
    setTimeout(() => {
        processDivination();
    }, 100);
}

// ============================================
// INITIALIZE ON LOAD
// ============================================
document.addEventListener('DOMContentLoaded', init);

// End of Divination functions

// ============================================
// MISSIONS LOGIC (Kiếm Xu)
// ============================================

function openMissionsModal() {
    document.getElementById('missionsModal').style.display = 'flex';
    fetchAndRenderMissions();
}

function closeMissionsModal() {
    document.getElementById('missionsModal').style.display = 'none';
}

async function fetchAndRenderMissions() {
    const container = document.getElementById('missionsContainer');
    const token = localStorage.getItem('sa_token');
    
    if (!token) {
        container.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">Vui lòng đăng nhập để xem nhiệm vụ.</div>';
        return;
    }

    container.innerHTML = '<div style="text-align: center; color: #aaa; padding: 20px;">Đang tải danh sách nhiệm vụ...</div>';

    try {
        const res = await fetch('/api/auth?action=missions', {
            headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();
        
        if (!data.success) {
            container.innerHTML = \`<div style="text-align: center; color: #e74c3c; padding: 20px;">Lỗi: \${data.error || 'Không thể tải nhiệm vụ'}</div>\`;
            return;
        }

        renderMissionsList(data.missions, data.checkinState);

    } catch (err) {
        console.error("Lỗi fetch missions:", err);
        container.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">Lỗi kết nối. Vui lòng thử lại sau.</div>';
    }
}

function renderMissionsList(missions, checkinState, validReferrals = 0) {
    const container = document.getElementById('missionsContainer');
    let html = '<div class="mission-list">';

    // 1. Điểm danh hàng ngày (Luôn ở trên cùng)
    const checkinClass = checkinState.is_completed ? 'completed' : '';
    const checkinText = checkinState.is_completed ? 'Đã Nhận' : 'Làm';
    const checkinAction = checkinState.is_completed ? '' : 'onclick="doCheckinMission()"';
    
    html += \`
        <div class="mission-item">
            <div class="mission-info">
                <div class="mission-title">📅 Điểm danh hàng ngày</div>
                <div class="mission-reward">+5 xu</div>
            </div>
            <div class="mission-action">
                <button id="btnMissionCheckin" class="btn-mission \${checkinClass}" \${checkinAction}>\${checkinText}</button>
            </div>
        </div>
    \`;

    // 2. Chia missions thành các nhóm (Hot chưa làm, Thường chưa làm, Hot đã làm, Thường đã làm)
    const pendingHot = [];
    const pendingNormal = [];
    const completedMissions = [];

    missions.forEach(m => {
        if (m.is_completed) {
            completedMissions.push(m);
        } else if (m.is_hot) {
            pendingHot.push(m);
        } else {
            pendingNormal.push(m);
        }
    });

    // 3. Render nhóm Hot chưa làm
    pendingHot.forEach(m => {
        html += createMissionItemHTML(m, validReferrals);
    });

    // 4. Render nhóm Thường chưa làm
    pendingNormal.forEach(m => {
        html += createMissionItemHTML(m, validReferrals);
    });

    // 5. Render nhóm Đã làm (Mờ đi)
    completedMissions.forEach(m => {
        html += createMissionItemHTML(m, validReferrals);
    });

    html += '</div>';
    container.innerHTML = html;
}

function createMissionItemHTML(mission, validReferrals = 0) {
    const hotClass = mission.is_hot ? 'mission-hot' : '';
    const hotIcon = mission.is_hot ? '🔥 ' : '';
    let btnClass = mission.is_completed ? 'completed' : '';
    let btnText = mission.is_completed ? 'Hoàn Thành' : 'Làm';
    let title = mission.title;
    
    // Referral logic
    if (mission.action_url && mission.action_url.startsWith('#referral_')) {
        const parts = mission.action_url.split('_');
        const target = parseInt(parts[1]);
        if (!isNaN(target)) {
            title = \`\${title} (\${validReferrals}/\${target})\`;
            if (!mission.is_completed) {
                if (validReferrals >= target) {
                    btnText = 'Nhận Xu';
                    btnClass = 'hot'; // Make it stand out
                } else {
                    btnText = 'Chưa Đạt';
                }
            }
        }
    } else if (mission.action_url === '#enter_referral' && !mission.is_completed) {
        btnText = 'Nhập Mã';
    }
    
    // Nếu có action_url, bấm Làm sẽ mở link. Nếu không thì báo lỗi chưa code link.
    const actionAttr = mission.is_completed ? '' : \`onclick="doMission('\${mission.id}', '\${mission.action_url || ''}')"\`;

    return \`
        <div class="mission-item \${hotClass}">
            <div class="mission-info">
                <div class="mission-title">\${hotIcon}\${title}</div>
                <div class="mission-reward">+\${mission.reward_xu} xu</div>
            </div>
            <div class="mission-action">
                <button class="btn-mission \${btnClass}" \${actionAttr}>\${btnText}</button>
            </div>
        </div>
    \`;
}

async function doCheckinMission() {
    const btn = document.getElementById('btnMissionCheckin');
    btn.disabled = true;
    btn.innerText = "Đang xử lý...";
    
    await window.dailyCheckin(); // Gọi hàm cũ ở app.js
    
    // Đợi 1 giây rồi refresh lại danh sách để cập nhật UI popup
    setTimeout(() => {
        fetchAndRenderMissions();
    }, 1000);
}

let currentDonateMissionId = null;

function doMission(id, url) {
    if (url) {
        if (url === '#enter_referral') {
            const code = prompt("Nhập mã giới thiệu (6 ký tự):");
            if (code) submitReferralCode(code);
            return;
        } else if (url.startsWith('#referral_')) {
            const target = parseInt(url.split('_')[1]);
            claimReferralMission(id, target);
            return;
        } else if (url.toLowerCase().endsWith('.jpg') || url.toLowerCase().endsWith('.png')) {
            // Hiển thị Donate Modal
            currentDonateMissionId = id;
            document.getElementById('donateQrImage').src = url;
            
            // Lấy email user từ giao diện
            const emailElem = document.getElementById('authDropdownTrigger');
            let emailText = "Email_Của_Bạn";
            if (emailElem && emailElem.innerText.includes('@')) {
                emailText = emailElem.innerText.split(' |')[0].trim();
            }
            document.getElementById('donateUserEmail').innerText = emailText.split('@')[0];
            
            document.getElementById('donateModal').style.display = 'flex';
        } else {
            window.open(url, '_blank');
        }
    } else {
        alert("Chưa có link hướng dẫn cho nhiệm vụ này. Liên hệ Admin.");
    }
}

async function submitReferralCode(code) {
    const token = localStorage.getItem('sa_token');
    if (!token) return;
    try {
        const res = await fetch('/api/auth?action=enter_referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
            body: JSON.stringify({ referral_code: code.trim().toUpperCase() })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            fetchAndRenderMissions();
            if (typeof initAuth === 'function') initAuth(); // Refresh xu
        } else {
            alert(data.error || "Lỗi nhập mã");
        }
    } catch (e) {
        alert("Lỗi kết nối");
    }
}

async function claimReferralMission(missionId, target) {
    const token = localStorage.getItem('sa_token');
    if (!token) return;
    try {
        const res = await fetch('/api/auth?action=claim_referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
            body: JSON.stringify({ mission_id: missionId, target: target })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            fetchAndRenderMissions();
            if (typeof initAuth === 'function') initAuth();
        } else {
            alert(data.error || "Bạn chưa đạt yêu cầu mốc này!");
        }
    } catch (e) {
        alert("Lỗi kết nối");
    }
}

function closeDonateModal() {
    document.getElementById('donateModal').style.display = 'none';
    currentDonateMissionId = null;
}

async function confirmDonate() {
    if (!currentDonateMissionId) return;

    const btn = document.getElementById('btnConfirmDonate');
    const oldText = btn.innerText;
    btn.innerText = "Đang gửi yêu cầu...";
    btn.disabled = true;

    try {
        const token = localStorage.getItem('sa_token');
        const res = await fetch('/api/auth?action=request_deposit', {
            method: 'POST',
            headers: {
                'Authorization': \`Bearer \${token}\`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mission_id: currentDonateMissionId })
        });
        const data = await res.json();
        
        if (data.success) {
            alert("Đã gửi yêu cầu xác nhận nạp xu! Vui lòng chờ Admin duyệt nhé.");
            closeDonateModal();
        } else {
            alert("Lỗi: " + data.error);
        }
    } catch (e) {
        alert("Lỗi kết nối. Vui lòng thử lại sau.");
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}
`;
    fs.writeFileSync('app.js', newContent, 'utf8');
    console.log('Fixed app.js');
} else {
    console.log('Not found');
}

function copyReferralCode() {
    const code = document.getElementById('myReferralCode').innerText;
    if (code && code !== '---') {
        navigator.clipboard.writeText(code).then(() => {
            alert('�� copy m� gi?i thi?u: ' + code);
        }).catch(err => {
            alert('L?i copy: ' + err);
        });
    }
}
