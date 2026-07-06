// --- TOAST SYSTEM ---
function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast-msg ' + (type==='error'?'toast-error':(type==='success'?'toast-success':'toast-warning'));
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let adminToken = localStorage.getItem('sa_token') || null;

async function checkLogin() {
    if (!adminToken) return;
    try {
        const roleRes = await fetch('/api/auth?action=profile', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const roleData = await roleRes.json();
        if (roleData.success && roleData.profile.role === 'admin') {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('admin-content').style.display = 'block';
            loadAdminData();
            // Auto refresh every 15 seconds
            setInterval(loadAdminData, 15000);
        } else {
            // Not admin
            adminToken = null;
        }
    } catch (e) {
        // network error
    }
}

// Call on load
checkLogin();

async function loginAdmin() {
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    
    try {
        const res = await fetch('/api/auth?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            adminToken = data.data.access_token;
            localStorage.setItem('sa_token', adminToken);
            checkLogin();
        } else {
            showToast(data.error || "Sai email hoặc mật khẩu");
        }
    } catch (e) {
        showToast("Lỗi kết nối");
    }
}

async function fetchAdmin(action, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(`/api/admin?action=${action}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi server");
    return data;
}

async function loadAdminData() {
    try {
        loadMissions(); // Load missions asynchronously
        loadDeposits(); // Load deposits asynchronously
        
        // Load all data concurrently
        const [statsData, configData, usersData] = await Promise.all([
            fetchAdmin('stats'),
            fetchAdmin('config'),
            fetchAdmin('users')
        ]);

        document.getElementById('statUsers').textContent = statsData.stats.totalUsers;
        document.getElementById('statQueries').textContent = statsData.stats.queriesToday;
        document.getElementById('statXu').textContent = statsData.stats.xuConsumedToday;
        
        const apiKeysRow = configData.data.find(c => c.config_key === 'api_keys');
        const keys = apiKeysRow ? apiKeysRow.config_value : ["", "", "", "", ""];
        
        const container = document.getElementById('apiKeysContainer');
        container.innerHTML = '';
        for(let i=0; i<5; i++) {
            container.innerHTML += `
                <div class="api-key-row">
                    <span>Key ${i+1}:</span>
                    <input type="text" id="apikey_${i}" value="${keys[i] || ''}" placeholder="AIzaSy...">
                </div>
            `;
        }
        
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        usersData.data.forEach((u, index) => {
            const date = new Date(u.created_at).toLocaleDateString('vi-VN');
            let email = u.email || u.id;
            let displayEmail = email;
            if (displayEmail.endsWith('@gieoque.id.vn')) displayEmail = displayEmail.replace('@gieoque.id.vn', '');
            
            tbody.innerHTML += `
                <tr>
                    <td style="font-weight:600">${displayEmail}</td>
                    <td style="color:#f1c40f; font-weight:bold">${u.xu_balance}</td>
                    <td>${u.role}</td>
                    <td>${date}</td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <input type="number" id="xu_input_${index}" style="width:70px; padding:5px; border-radius:4px; background:#1a2235; border:1px solid #333; color:#fff;" placeholder="Số xu" min="1">
                            <button onclick="updateUserXu('${email}', 'add', ${index})" style="background:#27ae60; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Cộng Xu">+</button>
                            <button onclick="updateUserXu('${email}', 'sub', ${index})" style="background:#e74c3c; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Trừ Xu">-</button>
                            
                            <button onclick="resetPassword('${u.id}', '${displayEmail}')" style="background:#f39c12; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-left: 10px;" title="Đổi Mật Khẩu">🔑</button>
                            <button onclick="deleteUser('${u.id}', '${displayEmail}')" style="background:#c0392b; color:#fff; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Xóa User">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
    } catch (e) {
        showToast("Lỗi tải dữ liệu: " + e.message);
    }
}

async function saveApiKeys() {
    const keys = [];
    for(let i=0; i<5; i++) {
        keys.push(document.getElementById(`apikey_${i}`).value.trim());
    }
    
    try {
        await fetchAdmin('config', 'POST', { key: 'api_keys', value: keys });
        showToast("Đã lưu API Keys thành công!");
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
}

async function updateUserXu(email, action, index) {
    const amountStr = document.getElementById(`xu_input_${index}`).value;
    const amount = parseInt(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
        return showToast("Vui lòng nhập số lượng xu hợp lệ (lớn hơn 0)!");
    }
    
    const finalAmount = action === 'add' ? amount : -amount;
    const actionText = action === 'add' ? 'cộng' : 'trừ';
    
    if (confirm(`Bạn chắc chắn muốn ${actionText} ${amount} xu cho user ${email}?`)) {
        try {
            await fetchAdmin('update_xu', 'POST', { email, amount: finalAmount });
            showToast("Thành công!");
            loadAdminData(); // reload bảng
        } catch (e) {
            showToast("Lỗi: " + e.message);
        }
    }
}

function filterUsers() {
    const input = document.getElementById('searchUserEmail').value.toLowerCase();
    const rows = document.getElementById('usersTableBody').getElementsByTagName('tr');
    
    for (let i = 0; i < rows.length; i++) {
        const emailCell = rows[i].getElementsByTagName('td')[0];
        if (emailCell) {
            const txtValue = emailCell.textContent || emailCell.innerText;
            if (txtValue.toLowerCase().indexOf(input) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }
    }
}

async function deleteUser(userId, displayEmail) {
    if (confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa hoàn toàn tài khoản "${displayEmail}"?\nHành động này không thể hoàn tác và sẽ xóa cả lịch sử của user này!`)) {
        try {
            await fetchAdmin('delete_user', 'POST', { userId });
            showToast("Đã xóa tài khoản thành công!");
            loadAdminData(); // Tải lại bảng
        } catch (e) {
            showToast("Lỗi khi xóa: " + e.message);
        }
    }
}

async function resetPassword(userId, displayEmail) {
    const newPassword = prompt(`🔑 Nhập mật khẩu MỚI cho tài khoản "${displayEmail}":\n(Mật khẩu phải từ 6 ký tự trở lên)`);
    if (newPassword === null) return; // Hủy
    
    if (newPassword.trim().length < 6) {
        return showToast("Mật khẩu phải có ít nhất 6 ký tự!");
    }
    
    if (confirm(`Xác nhận đổi mật khẩu cho "${displayEmail}" thành: ${newPassword} ?`)) {
        try {
            await fetchAdmin('reset_password', 'POST', { userId, newPassword: newPassword.trim() });
            showToast("Đổi mật khẩu thành công! Khách hàng có thể đăng nhập bằng mật khẩu mới ngay lập tức.");
        } catch (e) {
            showToast("Lỗi khi đổi mật khẩu: " + e.message);
        }
    }
}

// ========================================
// MISSIONS MANAGEMENT
// ========================================

async function loadMissions() {
    try {
        const res = await fetchAdmin('get_missions', 'GET');
        const tbody = document.getElementById('missionsTableBody');
        tbody.innerHTML = '';
        
        res.data.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.title} ${m.action_url ? '<a href="'+m.action_url+'" target="_blank" style="font-size:0.8rem;color:#3498db;">[Link]</a>' : ''}</td>
                <td style="color:#f1c40f;">+${m.reward_xu}</td>
                <td>${m.is_hot ? '🔥' : ''}</td>
                <td>
                    <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; background: ${m.is_active ? '#e74c3c' : '#2ecc71'};" onclick="toggleMissionActive('${m.id}', ${!m.is_active})">
                        ${m.is_active ? 'Tắt' : 'Bật'}
                    </button>
                </td>
                <td>
                    <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; background: #3498db; margin-right: 5px;" onclick="editMission('${m.id}', '${m.title}', ${m.reward_xu}, '${m.action_url || ''}', ${m.is_hot})">Sửa</button>
                    <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; background: #e74c3c;" onclick="deleteMission('${m.id}')">Xóa</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load missions", e);
    }
}

async function addMission() {
    const title = document.getElementById('newMissionTitle').value.trim();
    const reward = parseInt(document.getElementById('newMissionReward').value);
    const url = document.getElementById('newMissionUrl').value.trim();
    const isHot = document.getElementById('newMissionHot').checked;

    if (!title || !reward) return showToast("Vui lòng nhập tên và số xu thưởng!");

    const btn = event.target || document.querySelector('button[onclick="addMission()"]');
    const oldText = btn.innerText;
    btn.innerText = "Đang lưu...";
    btn.disabled = true;

    try {
        await fetchAdmin('add_mission', 'POST', {
            title,
            reward_xu: reward,
            action_url: url,
            is_hot: isHot
        });
        document.getElementById('newMissionTitle').value = '';
        document.getElementById('newMissionReward').value = '';
        document.getElementById('newMissionUrl').value = '';
        document.getElementById('newMissionHot').checked = false;
        await loadMissions();
    } catch (e) {
        showToast("Lỗi: " + e.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}

async function toggleMissionActive(id, newState) {
    try {
        await fetchAdmin('update_mission', 'POST', { id, is_active: newState });
        loadMissions();
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
}

async function editMission(id, currentTitle, currentReward, currentUrl, currentHot) {
    const newTitle = prompt("Nhập tên nhiệm vụ mới:", currentTitle);
    if (newTitle === null) return;
    
    const newReward = prompt("Nhập số xu thưởng mới:", currentReward);
    if (newReward === null) return;

    const newUrl = prompt("Nhập link mới (để trống nếu không có):", currentUrl);
    if (newUrl === null) return;

    const isHot = confirm("Nhiệm vụ này có phải HOT không? (OK = Có, Cancel = Không)");

    try {
        await fetchAdmin('update_mission', 'POST', {
            id,
            title: newTitle.trim(),
            reward_xu: parseInt(newReward) || 0,
            action_url: newUrl.trim(),
            is_hot: isHot
        });
        loadMissions();
    } catch (e) {
        showToast("Lỗi sửa nhiệm vụ: " + e.message);
    }
}

async function deleteMission(id) {
    if (!confirm("Bạn có chắc muốn xóa nhiệm vụ này? Lịch sử người dùng đã làm nhiệm vụ này cũng sẽ bị xóa.")) return;
    try {
        await fetchAdmin('delete_mission', 'POST', { id });
        loadMissions();
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
}

// ==========================================
// DEPOSIT REQUESTS
// ==========================================

let previousPendingCount = -1;

async function loadDeposits() {
    try {
        const data = await fetchAdmin('get_deposits');
        const tbody = document.getElementById('depositsTableBody');
        tbody.innerHTML = '';
        
        const pendingDeposits = data.deposits ? data.deposits.filter(d => d.status === 'pending') : [];

        if (previousPendingCount !== -1 && pendingDeposits.length > previousPendingCount) {
            showToast("Có yêu cầu nạp xu mới!", "warning");
        }
        previousPendingCount = pendingDeposits.length;

        if (pendingDeposits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#aaa;">Chưa có yêu cầu nào chờ duyệt</td></tr>';
            return;
        }

        pendingDeposits.forEach(d => {
            const tr = document.createElement('tr');
            const timeStr = new Date(d.created_at).toLocaleString('vi-VN');
            
            let statusHtml = '';
            let actionHtml = '';

            if (d.status === 'pending') {
                statusHtml = '<span style="color:#f39c12; font-weight:bold;">Chờ Duyệt</span>';
                actionHtml = `
                    <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; background: #2ecc71; margin-right: 5px;" onclick="approveDeposit('${d.id}')">Duyệt (+${d.reward_xu} xu)</button>
                    <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; background: #e74c3c;" onclick="rejectDeposit('${d.id}')">Từ chối</button>
                `;
            } else if (d.status === 'approved') {
                statusHtml = '<span style="color:#2ecc71; font-weight:bold;">Đã Duyệt</span>';
                actionHtml = '<span style="color:#aaa;">-</span>';
            } else {
                statusHtml = '<span style="color:#e74c3c; font-weight:bold;">Từ Chối</span>';
                actionHtml = '<span style="color:#aaa;">-</span>';
            }

            tr.innerHTML = `
                <td>${d.email}</td>
                <td>${d.mission_title}</td>
                <td style="color:#f1c40f;">+${d.reward_xu}</td>
                <td>${timeStr}</td>
                <td>${statusHtml}</td>
                <td>${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Lỗi load deposits:", e);
    }
}

async function approveDeposit(id) {
    if (!confirm("Bạn có chắc chắn muốn Duyệt yêu cầu này? Hệ thống sẽ tự động cộng xu cho User.")) return;
    try {
        await fetchAdmin('approve_deposit', 'POST', { id });
        loadAdminData(); // Tải lại toàn bộ bảng (deposits, users, stats)
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
}

async function rejectDeposit(id) {
    if (!confirm("Từ chối yêu cầu này?")) return;
    try {
        await fetchAdmin('reject_deposit', 'POST', { id });
        loadDeposits(); // Chỉ tải lại bảng deposits
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
}

