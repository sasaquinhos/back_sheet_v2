document.addEventListener('DOMContentLoaded', () => {
    const ROWS = 9;
    const COLS_PER_BLOCK = 22;
    const TOTAL_COLS = COLS_PER_BLOCK * 2;
    const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    let currentGroup = null;
    let seatData = {}; // {seatId: group}
    let isDragging = false;
    let lastProcessedSeatId = null;
    let dragAction = null; // 'paint' or 'erase'
    let lastX = null;
    let lastY = null;
    let isExpanded = false;

    // --- DOM要素 ---
    const mainContent = document.getElementById('main-content');
    const accessScreen = document.getElementById('access-screen');
    const seatGrid = document.getElementById('seat-grid');
    const groupButtons = document.querySelectorAll('.group-btn');
    const specialInputA = document.getElementById('special-input-a');
    const currentGroupDisplay = document.getElementById('current-group-display');
    const colCountInputA = document.getElementById('col-count-a');
    const syncStatus = document.getElementById('sync-status');
    const lockBtn = document.getElementById('lock-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const podiumBtn = document.getElementById('podium-btn');
    const seatMapContainer = document.getElementById('seat-map-container');
    const scrollSlider = document.getElementById('scroll-slider');

    // 認証・管理者関連
    const accessKeyInput = document.getElementById('access-key-input');
    const accessSubmitBtn = document.getElementById('access-submit-btn');
    const accessError = document.getElementById('access-error');
    const accessAdminBtn = document.getElementById('access-admin-btn');
    const adminLoginModal = document.getElementById('admin-login-modal');
    const adminPassInput = document.getElementById('admin-pass-input');
    const adminLoginSubmit = document.getElementById('admin-login-submit');
    const adminLoginCancel = document.getElementById('admin-login-cancel');
    const adminLoginError = document.getElementById('admin-login-error');
    const adminOpenBtn = document.getElementById('admin-open-btn');
    const adminPanel = document.getElementById('admin-panel');
    const adminPanelClose = document.getElementById('admin-panel-close');
    const generateKeyBtn = document.getElementById('generate-key-btn');
    const keyHoursInput = document.getElementById('key-hours');
    const keyMinsInput = document.getElementById('key-mins');
    const generatedKeyDisplay = document.getElementById('generated-key-display');
    const newKeyVal = document.getElementById('new-key-val');
    const newKeyExpiry = document.getElementById('new-key-expiry');
    const updatePassBtn = document.getElementById('update-pass-btn');
    const newAdminPass = document.getElementById('new-admin-pass');

    // --- Web化対応: API設定 ---
    const API_URL = "https://script.google.com/macros/s/AKfycbzHISB2XfHMVHyROwBlr2gD9Dkf8ky0dyHes0HXSC9u5vKq4ERgAVgOYF_Oz6u_wCesmw/exec";

    // 0. 認証処理
    function getStoredKey() {
        return localStorage.getItem('projecte_access_key');
    }

    function saveStoredKey(key) {
        localStorage.setItem('projecte_access_key', key);
    }

    async function checkAuth() {
        const key = getStoredKey();
        if (!key) {
            showAccessScreen();
            return;
        }

        try {
            const res = await fetch(`${API_URL}?action=verifyKey&accessKey=${key}`);
            const json = await res.json();
            if (json.status === "success") {
                showMainContent();
                initApp();
            } else {
                showAccessScreen(json.message);
            }
        } catch (e) {
            console.error(e);
            showAccessScreen("通信エラーが発生しました");
        }
    }

    function showAccessScreen(error = "") {
        mainContent.classList.add('hidden');
        accessScreen.classList.remove('hidden');
        if (error) accessError.textContent = error;
    }

    function showMainContent() {
        accessScreen.classList.add('hidden');
        mainContent.classList.remove('hidden');
    }

    // 入場ボタン
    accessSubmitBtn.addEventListener('click', async () => {
        const key = accessKeyInput.value.trim();
        if (!key) return;
        
        accessSubmitBtn.disabled = true;
        accessError.textContent = "検証中...";
        
        try {
            const res = await fetch(`${API_URL}?action=verifyKey&accessKey=${key}`);
            const json = await res.json();
            if (json.status === "success") {
                saveStoredKey(key);
                showMainContent();
                initApp();
            } else {
                accessError.textContent = json.message;
            }
        } catch (e) {
            accessError.textContent = "接続に失敗しました";
        } finally {
            accessSubmitBtn.disabled = false;
        }
    });

    // 管理者ログイン関連
    accessAdminBtn.addEventListener('click', () => adminLoginModal.classList.remove('hidden'));
    adminOpenBtn.addEventListener('click', () => adminLoginModal.classList.remove('hidden'));
    adminLoginCancel.addEventListener('click', () => {
        adminLoginModal.classList.add('hidden');
        adminLoginError.textContent = "";
    });

    adminLoginSubmit.addEventListener('click', async () => {
        const pass = adminPassInput.value;
        if (!pass) return;

        adminLoginSubmit.disabled = true;
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({ action: "adminLogin", adminPassword: pass })
            });
            const json = await res.json();
            if (json.status === "success") {
                adminLoginModal.classList.add('hidden');
                adminPanel.classList.remove('hidden');
                adminPassInput.value = "";
            } else {
                adminLoginError.textContent = json.message;
            }
        } catch (e) {
            adminLoginError.textContent = "ログインに失敗しました";
        } finally {
            adminLoginSubmit.disabled = false;
        }
    });

    adminPanelClose.addEventListener('click', () => adminPanel.classList.add('hidden'));

    // キー生成
    generateKeyBtn.addEventListener('click', async () => {
        // パスワードを再利用するか、別途セッションで管理するかだが、今回はモーダルを開いたままなので入力済みのもの（もしくは再度聞く）
        // ここでは便宜上、入力されていたパスワードを一時保持して使うか、再度入力を求める。
        // シンプルにするため、パネルを開く際に使ったパスワードを内部で保持するか、サーバー側でセッションを持たせたいが、GASなので都度送信。
        // （本来は localStorage に admin_token を入れるべきだが、今回は手順を簡略化）
        const pass = adminPassInput.value || prompt("管理者パスワードを再入力してください");
        if (!pass) return;

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({ 
                    action: "generateKey", 
                    adminPassword: pass,
                    hours: keyHoursInput.value,
                    mins: keyMinsInput.value
                })
            });
            const json = await res.json();
            if (json.status === "success") {
                generatedKeyDisplay.classList.remove('hidden');
                newKeyVal.textContent = json.key;
                newKeyExpiry.textContent = json.expiry;
            } else {
                alert(json.message);
            }
        } catch (e) {
            alert("生成に失敗しました");
        }
    });

    // パスワード更新
    updatePassBtn.addEventListener('click', async () => {
        const pass = prompt("現在のパスワードを入力してください");
        const next = newAdminPass.value;
        if (!pass || !next) return;

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({ action: "updateAdminPass", oldPassword: pass, newPassword: next })
            });
            const json = await res.json();
            alert(json.message);
            if (json.status === "success") newAdminPass.value = "";
        } catch (e) {
            alert("更新に失敗しました");
        }
    });


    // --- 既存のアプリケーションロジック ---

    async function loadData() {
        if (!API_URL) return;
        const key = getStoredKey();
        setSyncStatus('saving', '読込中...');
        try {
            const res = await fetch(`${API_URL}?action=getSeatData&accessKey=${key}`);
            const json = await res.json();
            
            if (json.authError) {
                showAccessScreen("セッションが切れました");
                return;
            }

            if (json.status === "success") {
                seatData = json.data || {};
                if (Object.keys(seatData).length === 0) fillDefaultSeats();
                renderAllSeats();
                updateSummary();
            }
            setSyncStatus('idle', '同期完了');
        } catch (e) {
            setSyncStatus('error', '読込失敗');
        }
    }

    async function saveData() {
        if (!API_URL) return;
        const key = getStoredKey();
        try {
            // mode: "no-cors" はレスポンスが取れないため、
            // 認証状況を確認したい場合は通常のモード（cors）で送る必要がある。
            // GAS側で ContentService を返していれば cors で問題ない。
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "saveSeatData",
                    accessKey: key,
                    data: seatData
                })
            });
            const json = await res.json();
            if (json.authError) {
                showAccessScreen("セッションが切れました");
                return;
            }
            setSyncStatus('idle', '保存完了');
        } catch (e) {
            console.error(e);
            setSyncStatus('error', '保存失敗');
        }
    }

    function renderAllSeats() {
        createSeats(); // 再生成してデータを反映
    }

    let saveTimeout = null;
    function requestSave() {
        setSyncStatus('saving', '保存中...');
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveData, 2000);
    }

    function setSyncStatus(type, text) {
        if (!syncStatus) return;
        syncStatus.className = `sync-${type}`;
        syncStatus.textContent = text;
    }

    function createSeats() {
        seatGrid.innerHTML = '';
        const currentTotalCols = isExpanded ? TOTAL_COLS + COLS_PER_BLOCK : TOTAL_COLS;
        const startColNumber = 88 - currentTotalCols + 1;

        const emptyCorner = document.createElement('div');
        emptyCorner.className = 'grid-label';
        seatGrid.appendChild(emptyCorner);

        for (let c_index = 0; c_index < currentTotalCols; c_index++) {
            const colLabel = document.createElement('div');
            colLabel.className = 'grid-label col-label';
            colLabel.textContent = startColNumber + c_index;
            seatGrid.appendChild(colLabel);
        }

        for (let r = 1; r <= ROWS; r++) {
            const rowLabel = document.createElement('div');
            rowLabel.className = 'grid-label row-label';
            rowLabel.textContent = (ROWS - r + 1);
            seatGrid.appendChild(rowLabel);

            const blocks = isExpanded ? [0, 1, 2] : [1, 2];
            let absoluteCol = 1;
            blocks.forEach(bId => {
                for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                    const seatId = `block${bId}-r${r}-c${c}`;
                    const seat = createSeatElement(seatId, r, absoluteCol);
                    if (seatData[seatId]) {
                        seat.classList.add(`group-${seatData[seatId]}`);
                        seat.dataset.color = seatData[seatId];
                    }
                    seatGrid.appendChild(seat);
                    absoluteCol++;
                }
            });
        }
        updateSliderRange();
    }

    function createSeatElement(id, row, col) {
        const div = document.createElement('div');
        div.className = 'seat';
        div.id = id;
        div.dataset.row = row;
        div.dataset.col = col;

        div.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            isDragging = true;
            handleSeatClick(id, true);
        });

        div.addEventListener('mouseenter', () => {
            if (isDragging) handleSeatClick(id);
        });

        div.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDragging = true;
            const touch = e.touches[0];
            lastX = touch.clientX;
            lastY = touch.clientY;
            handleSeatClick(id, true);
        }, { passive: false });

        return div;
    }

    function handleSeatClick(seatId, isStartOfAction = false) {
        if (!currentGroup || currentGroup === 'A') return;
        if (seatId === lastProcessedSeatId) return;

        const seatEl = document.getElementById(seatId);
        if (!seatEl) return;

        const currentColor = seatEl.dataset.color || '';

        if (isStartOfAction) {
            isDragging = true;
            if (currentColor === currentGroup) dragAction = 'erase';
            else if (currentColor === '') dragAction = 'paint';
            else dragAction = 'doNothing';
        }

        if (!isDragging || !dragAction || dragAction === 'doNothing') return;

        lastProcessedSeatId = seatId;

        if (dragAction === 'erase' && currentColor === currentGroup) {
            updateSeat(seatId, null);
        } else if (dragAction === 'paint' && currentColor === '') {
            updateSeat(seatId, currentGroup);
        }
    }

    function updateSeat(seatId, group) {
        const seatEl = document.getElementById(seatId);
        if (!seatEl) return;
        GROUPS.forEach(g => seatEl.classList.remove(`group-${g}`));
        if (group) {
            seatEl.classList.add(`group-${group}`);
            seatEl.dataset.color = group;
            seatData[seatId] = group;
        } else {
            seatEl.dataset.color = '';
            delete seatData[seatId];
        }
        updateSummary();
        requestSave();
    }

    function fillDefaultSeats() {
        const targets = ['block1-r7-c11', 'block1-r7-c12', 'block1-r8-c11', 'block1-r8-c12',
                         'block0-r7-c9', 'block0-r7-c10', 'block0-r8-c9', 'block0-r8-c10'];
        targets.forEach(id => { seatData[id] = 'J'; });
    }

    function runGroupAFill() {
        const colCount = parseInt(colCountInputA.value);
        if (isNaN(colCount) || colCount < 0) return;
        const currentTotalCols = isExpanded ? TOTAL_COLS + COLS_PER_BLOCK : TOTAL_COLS;
        const blocks = isExpanded ? [0, 1, 2] : [1, 2];

        for (let r = 1; r <= ROWS; r++) {
            let absoluteCol = 1;
            blocks.forEach(bId => {
                for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                    const seatId = `block${bId}-r${r}-c${c}`;
                    let effectiveCol = currentTotalCols - (absoluteCol - 1);
                    if (effectiveCol <= colCount) updateSeat(seatId, 'A');
                    else if (seatData[seatId] === 'A') updateSeat(seatId, null);
                    absoluteCol++;
                }
            });
        }
    }

    function updateSummary() {
        const counts = {};
        GROUPS.forEach(g => counts[g] = 0);
        const activeBlocks = isExpanded ? [0, 1, 2] : [1, 2];

        Object.keys(seatData).forEach(seatId => {
            const group = seatData[seatId];
            const blockId = parseInt(seatId.split('-')[0].replace('block', ''));
            if (activeBlocks.indexOf(blockId) !== -1 && counts[group] !== undefined) {
                counts[group]++;
            }
        });

        let totalBH = 0;
        GROUPS.forEach(g => {
            const countEl = document.getElementById(`count-${g}`);
            if (g === 'A') {
                if (countEl) countEl.textContent = counts['A'] + counts['J'];
            } else if (g !== 'J') {
                if (countEl) countEl.textContent = counts[g];
                totalBH += counts[g];
            }
        });
        const totalBHEl = document.getElementById('count-total-BH');
        if (totalBHEl) totalBHEl.textContent = totalBH;
    }

    // イベント設定
    groupButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            groupButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentGroup = btn.dataset.group;
            currentGroupDisplay.textContent = btn.textContent;
            lockBtn.classList.remove('locked');
            lockBtn.textContent = 'ロック';
            seatGrid.classList.remove('is-locked');
            if (currentGroup === 'A') {
                specialInputA.classList.remove('hidden');
                setTimeout(() => colCountInputA.focus(), 10);
            } else {
                specialInputA.classList.add('hidden');
            }
        });
    });

    podiumBtn.addEventListener('click', () => {
        currentGroup = 'J';
        currentGroupDisplay.textContent = 'お立ち台 (濃いグレー)';
        groupButtons.forEach(b => b.classList.remove('active'));
        specialInputA.classList.add('hidden');
    });

    expandBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        expandBtn.textContent = isExpanded ? '縮小' : '拡張';
        if (!isExpanded) requestSave();
        createSeats();
        updateSummary();
    });

    lockBtn.addEventListener('click', () => {
        currentGroup = null;
        currentGroupDisplay.textContent = 'ロック中';
        groupButtons.forEach(b => b.classList.remove('active'));
        specialInputA.classList.add('hidden');
        lockBtn.classList.add('locked');
        lockBtn.textContent = 'ロック中';
        seatGrid.classList.add('is-locked');
    });

    clearAllBtn.addEventListener('click', () => {
        if (!confirm('すべての座席選択を解除してもよろしいですか？（※お立ち台は残ります）')) return;
        seatData = {};
        fillDefaultSeats();
        renderAllSeats();
        updateSummary();
        requestSave();
    });

    colCountInputA.addEventListener('keydown', (e) => { if (e.key === 'Enter') { runGroupAFill(); colCountInputA.blur(); } });
    colCountInputA.addEventListener('blur', runGroupAFill);

    function updateSliderRange() {
        if (!scrollSlider || !seatMapContainer) return;
        const maxScroll = seatMapContainer.scrollWidth - seatMapContainer.clientWidth;
        scrollSlider.max = maxScroll > 0 ? maxScroll : 0;
        scrollSlider.value = seatMapContainer.scrollLeft;
    }

    scrollSlider.addEventListener('input', () => { seatMapContainer.scrollLeft = scrollSlider.value; });
    seatMapContainer.addEventListener('scroll', () => { scrollSlider.value = seatMapContainer.scrollLeft; });
    window.addEventListener('resize', updateSliderRange);

    function resetDrag() { isDragging = false; lastProcessedSeatId = null; dragAction = null; }
    window.addEventListener('mouseup', resetDrag);
    window.addEventListener('touchend', resetDrag);

    // アプリ初期化
    function initApp() {
        loadData();
    }

    // 初回実行: 認証チェック
    checkAuth();
});
