let adminToken = null;

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
            // Check role
            const roleRes = await fetch('/api/auth?action=profile', {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            const roleData = await roleRes.json();
            
            if (roleData.success && roleData.profile.role === 'admin') {
                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('admin-content').style.display = 'block';
                loadAdminData();
            } else {
                alert("Tài khoản không có quyền Admin!");
            }
        } else {
            alert(data.error || "Sai email hoặc mật khẩu");
        }
    } catch (e) {
        alert("Lỗi kết nối");
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
        alert("Lỗi tải dữ liệu: " + e.message);
    }
}

async function saveApiKeys() {
    const keys = [];
    for(let i=0; i<5; i++) {
        keys.push(document.getElementById(`apikey_${i}`).value.trim());
    }
    
    try {
        await fetchAdmin('config', 'POST', { key: 'api_keys', value: keys });
        alert("Đã lưu API Keys thành công!");
    } catch (e) {
        alert("Lỗi: " + e.message);
    }
}

async function updateUserXu(email, action, index) {
    const amountStr = document.getElementById(`xu_input_${index}`).value;
    const amount = parseInt(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
        return alert("Vui lòng nhập số lượng xu hợp lệ (lớn hơn 0)!");
    }
    
    const finalAmount = action === 'add' ? amount : -amount;
    const actionText = action === 'add' ? 'cộng' : 'trừ';
    
    if (confirm(`Bạn chắc chắn muốn ${actionText} ${amount} xu cho user ${email}?`)) {
        try {
            await fetchAdmin('update_xu', 'POST', { email, amount: finalAmount });
            alert("Thành công!");
            loadAdminData(); // reload bảng
        } catch (e) {
            alert("Lỗi: " + e.message);
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
            alert("Đã xóa tài khoản thành công!");
            loadAdminData(); // Tải lại bảng
        } catch (e) {
            alert("Lỗi khi xóa: " + e.message);
        }
    }
}

async function resetPassword(userId, displayEmail) {
    const newPassword = prompt(`🔑 Nhập mật khẩu MỚI cho tài khoản "${displayEmail}":\n(Mật khẩu phải từ 6 ký tự trở lên)`);
    if (newPassword === null) return; // Hủy
    
    if (newPassword.trim().length < 6) {
        return alert("Mật khẩu phải có ít nhất 6 ký tự!");
    }
    
    if (confirm(`Xác nhận đổi mật khẩu cho "${displayEmail}" thành: ${newPassword} ?`)) {
        try {
            await fetchAdmin('reset_password', 'POST', { userId, newPassword: newPassword.trim() });
            alert("Đổi mật khẩu thành công! Khách hàng có thể đăng nhập bằng mật khẩu mới ngay lập tức.");
        } catch (e) {
            alert("Lỗi khi đổi mật khẩu: " + e.message);
        }
    }
}
