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
        // Load stats
        const statsData = await fetchAdmin('stats');
        document.getElementById('statUsers').textContent = statsData.stats.totalUsers;
        document.getElementById('statQueries').textContent = statsData.stats.queriesToday;
        document.getElementById('statXu').textContent = statsData.stats.xuConsumedToday;
        
        // Load config (API Keys)
        const configData = await fetchAdmin('config');
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
        
        // Load users
        const usersData = await fetchAdmin('users');
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        usersData.data.forEach(u => {
            const date = new Date(u.created_at).toLocaleDateString('vi-VN');
            tbody.innerHTML += `
                <tr>
                    <td style="font-family:monospace; font-size:0.8rem">${u.id}</td>
                    <td style="color:#f1c40f; font-weight:bold">${u.xu_balance}</td>
                    <td>${u.role}</td>
                    <td>${date}</td>
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

async function updateUserXu() {
    const userId = document.getElementById('targetUserId').value.trim();
    const amountStr = document.getElementById('targetXuAmount').value;
    const amount = parseInt(amountStr);
    
    if (!userId || isNaN(amount)) {
        return alert("Vui lòng nhập đủ ID và số lượng (âm hoặc dương)!");
    }
    
    if (confirm(`Bạn chắc chắn muốn cộng/trừ ${amount} xu cho user ${userId}?`)) {
        try {
            await fetchAdmin('update_xu', 'POST', { userId, amount });
            alert("Thành công!");
            loadAdminData(); // reload bảng
        } catch (e) {
            alert("Lỗi: " + e.message);
        }
    }
}
