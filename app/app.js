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
    let cachedAdminPass = null; // セッション中の管理者パスワード一時保持

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
    const expandBtn = document.getElementById('expand-btn'); // 復元
    const seatMapContainer = document.getElementById('seat-map-container');
    const scrollSlider = document.getElementById('scroll-slider');

    // 認証・管理者関連
    const accessKeyInput = document.getElementById('access-key-input');
    const accessSubmitBtn = document.getElementById('access-submit-btn');
    const accessError = document.getElementById('access-error');
    const accessAdminBtn = document.getElementById('access-admin-btn');
    const adminLoginModal = document.getElementById('admin-login-modal');
    const adminLoginInputs = document.getElementById('admin-login-inputs');
    const adminAuthLoadingMsg = document.getElementById('admin-auth-loading-msg');
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
    const fetchKeysBtn = document.getElementById('fetch-keys-btn');
    const activeKeysList = document.getElementById('active-keys-list');

    // --- API設定 ---
    const API_URL = "https://script.google.com/macros/s/AKfycbw8yGFzGmI0tip7jB4knIet7_yz2lVEX_9MQQW7O3N-vcyjTEw5kRBOtNwDIAWqkIZQ0A/exec";

    // --- 0. 認証と状態管理 ---
    function getStoredKey() {
        return localStorage.getItem('projecte_access_key');
    }
    function saveStoredKey(key) {
        localStorage.setItem('projecte_access_key', key);
    }

    async function checkAuth() {
        const key = getStoredKey();
        if (!key) {
            showAccessScreen("アクセスキーを入力してください");
            return;
        }

        // セッション確認中の表示
        showAccessScreen("", true);

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

    function showAccessScreen(error = "", isLoading = false) {
        mainContent.classList.add('hidden');
        accessScreen.classList.remove('hidden');
        
        const loadingMsg = document.getElementById('auth-loading-msg');
        const inputContainer = document.getElementById('auth-input-container');
        
        if (isLoading) {
            loadingMsg.classList.remove('hidden');
            inputContainer.classList.add('hidden');
        } else {
            loadingMsg.classList.add('hidden');
            inputContainer.classList.remove('hidden');
            if (error) accessError.textContent = error;
        }
    }

    function showMainContent() {
        accessScreen.classList.add('hidden');
        mainContent.classList.remove('hidden');
    }

    function setButtonLoading(btn, isLoading, loadingText = "実行中...", originalText = null) {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = originalText || btn.textContent;
            btn.disabled = true;
            btn.textContent = loadingText;
        } else {
            btn.disabled = false;
            btn.textContent = btn.dataset.originalText || btn.textContent;
        }
    }

    // 認証ボタン
    accessSubmitBtn.addEventListener('click', async () => {
        const key = accessKeyInput.value.trim();
        if (!key) return;
        
        setButtonLoading(accessSubmitBtn, true, "検証中...");
        accessError.textContent = "";

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
            setButtonLoading(accessSubmitBtn, false);
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

        // ログイン実行中の表示
        adminLoginInputs.classList.add('hidden');
        adminAuthLoadingMsg.classList.remove('hidden');
        adminLoginError.textContent = "";

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({ action: "adminLogin", adminPassword: pass })
            });
            const json = await res.json();
            if (json.status === "success") {
                cachedAdminPass = pass;
                adminLoginModal.classList.add('hidden');
                adminPanel.classList.remove('hidden');
                adminPassInput.value = "";
            } else {
                adminLoginError.textContent = json.message;
            }
        } catch (e) {
            adminLoginError.textContent = "ログインに失敗しました";
        } finally {
            adminLoginInputs.classList.remove('hidden');
            adminAuthLoadingMsg.classList.add('hidden');
        }
    });

    adminPanelClose.addEventListener('click', () => adminPanel.classList.add('hidden'));

    generateKeyBtn.addEventListener('click', async () => {
        const pass = cachedAdminPass || adminPassInput.value || prompt("管理者パスワードを再入力してください");
        if (!pass) return;
        
        setButtonLoading(generateKeyBtn, true, "生成中...");

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
                cachedAdminPass = pass;
                generatedKeyDisplay.classList.remove('hidden');
                newKeyVal.textContent = json.key;
                newKeyExpiry.textContent = json.expiry;
                activeKeysList.classList.add('hidden');
            } else {
                alert(json.message);
            }
        } catch (e) {
            alert("生成に失敗しました");
        } finally {
            setButtonLoading(generateKeyBtn, false);
        }
    });

    // キー一覧の取得・トグル
    fetchKeysBtn.addEventListener('click', async () => {
        // すでに表示されている場合は非表示にする (トグル)
        if (!activeKeysList.classList.contains('hidden')) {
            activeKeysList.classList.add('hidden');
            fetchKeysBtn.textContent = "アクセスキー表示";
            return;
        }

        const pass = cachedAdminPass || prompt("管理者パスワードを入力してください");
        if (!pass) return;

        setButtonLoading(fetchKeysBtn, true, "取得中...");

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({ action: "getAccessKeys", adminPassword: pass })
            });
            const json = await res.json();
            if (json.status === "success") {
                cachedAdminPass = pass;
                renderActiveKeys(json.keys);
                fetchKeysBtn.textContent = "アクセスキー非表示";
            } else {
                alert(json.message);
                setButtonLoading(fetchKeysBtn, false, "", "アクセスキー表示");
            }
        } catch (e) {
            alert("取得に失敗しました");
            setButtonLoading(fetchKeysBtn, false, "", "アクセスキー表示");
        } finally {
            if (activeKeysList.classList.contains('hidden')) {
                setButtonLoading(fetchKeysBtn, false, "", "アクセスキー表示");
            } else {
                fetchKeysBtn.disabled = false;
            }
        }
    });

    function renderActiveKeys(keys) {
        activeKeysList.innerHTML = '';
        activeKeysList.classList.remove('hidden');
        
        const keyEntries = Object.entries(keys);
        if (keyEntries.length === 0) {
            activeKeysList.innerHTML = '<p style="font-size:0.9rem; color:#888;">有効なキーはありません</p>';
            return;
        }

        keyEntries.forEach(([key, expiry]) => {
            const item = document.createElement('div');
            item.className = 'key-item';
            
            const expiryDate = new Date(expiry);
            item.innerHTML = `
                <span class="key-code">${key}</span>
                <span class="key-expiry">期限: ${expiryDate.toLocaleString()}</span>
            `;
            activeKeysList.appendChild(item);
        });
    }

    updatePassBtn.addEventListener('click', async () => {
        const pass = prompt("現在のパスワードを入力してください");
        if (!pass) return;
        const next = newAdminPass.value;
        if (!next) return;

        setButtonLoading(updatePassBtn, true, "更新中...");

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
        } finally {
            setButtonLoading(updatePassBtn, false);
        }
    });


    // --- 1. データの保存・同期 ---
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
            const res = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({ action: "saveSeatData", accessKey: key, data: seatData })
            });
            const json = await res.json();
            if (json.authError) {
                showAccessScreen("セッションが切れました");
                return;
            }
            setSyncStatus('idle', '保存完了');
        } catch (e) {
            setSyncStatus('error', '保存失敗');
        }
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

    // --- 2. 座席生成ロジック (復元) ---
    function renderAllSeats() {
        createSeats();
    }

    function createSeats() {
        seatGrid.innerHTML = '';
        const currentTotalCols = isExpanded ? TOTAL_COLS + COLS_PER_BLOCK : TOTAL_COLS;
        const startColNumber = 88 - currentTotalCols + 1;

        // 列番号ラベル
        const emptyCorner = document.createElement('div');
        emptyCorner.className = 'grid-label';
        seatGrid.appendChild(emptyCorner);

        for (let c_index = 0; c_index < currentTotalCols; c_index++) {
            const colLabel = document.createElement('div');
            colLabel.className = 'grid-label col-label';
            colLabel.textContent = startColNumber + c_index;
            seatGrid.appendChild(colLabel);
        }

        // 座席行
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

        // マス目属性 (元の実装に準拠)
        div.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
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

    // --- 3. 描画ロジックの復元 ---
    function processPoint(x, y) {
        const target = document.elementFromPoint(x, y);
        if (target && target.classList.contains('seat')) {
            handleSeatClick(target.id);
        }
    }

    function processLine(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist === 0) return;
        const steps = Math.ceil(dist / 10); // 10pxサンプリング
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            processPoint(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
        }
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

    // --- 4. 集計・UI更新 ---
    function updateSummary() {
        const counts = {};
        GROUPS.forEach(g => counts[g] = 0);
        const activeBlocks = isExpanded ? [0, 1, 2] : [1, 2];

        Object.keys(seatData).forEach(seatId => {
            const group = seatData[seatId];
            const blockNumStr = seatId.split('-')[0].replace('block', '');
            const blockId = parseInt(blockNumStr);
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

    // --- 5. イベントリスナー統合 ---

    // グループ選択ボタン
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

    // お立ち台ボタン
    podiumBtn.addEventListener('click', () => {
        currentGroup = 'J';
        currentGroupDisplay.textContent = 'お立ち台 (濃いグレー)';
        groupButtons.forEach(b => b.classList.remove('active'));
        specialInputA.classList.add('hidden');
        if (lockBtn) {
            lockBtn.classList.remove('locked');
            lockBtn.textContent = 'ロック';
            seatGrid.classList.remove('is-locked');
        }
    });

    // 拡張ボタン (復元)
    expandBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            expandBtn.textContent = '縮小';
            seatGrid.classList.add('expanded');
        } else {
            expandBtn.textContent = '拡張';
            seatGrid.classList.remove('expanded');
            requestSave();
            if (seatMapContainer) seatMapContainer.scrollTo({ left: 0, behavior: 'smooth' });
        }
        createSeats();
        updateSummary();

        if (isExpanded && seatMapContainer) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    seatMapContainer.scrollTo({ left: seatMapContainer.scrollWidth, behavior: 'smooth' });
                });
            });
        }
    });

    // ロックボタン
    lockBtn.addEventListener('click', () => {
        currentGroup = null;
        currentGroupDisplay.textContent = 'ロック中';
        groupButtons.forEach(b => b.classList.remove('active'));
        specialInputA.classList.add('hidden');
        lockBtn.classList.add('locked');
        lockBtn.textContent = 'ロック中';
        seatGrid.classList.add('is-locked');
    });

    // クリアボタン
    clearAllBtn.addEventListener('click', () => {
        if (!confirm('すべての座席選択を解除してもよろしいですか？（※お立ち台は残ります）')) return;
        seatData = {};
        fillDefaultSeats();
        renderAllSeats();
        updateSummary();
        requestSave();
    });

    // 中央塗りつぶし入力
    colCountInputA.addEventListener('keydown', (e) => { if (e.key === 'Enter') { runGroupAFill(); colCountInputA.blur(); } });
    colCountInputA.addEventListener('blur', runGroupAFill);

    // スライダー制御
    function updateSliderRange() {
        if (!scrollSlider || !seatMapContainer) return;
        const maxScroll = seatMapContainer.scrollWidth - seatMapContainer.clientWidth;
        scrollSlider.max = maxScroll > 0 ? maxScroll : 0;
        scrollSlider.value = seatMapContainer.scrollLeft;
    }

    scrollSlider.addEventListener('input', () => { if (seatMapContainer) seatMapContainer.scrollLeft = scrollSlider.value; });
    seatMapContainer.addEventListener('scroll', () => { if (scrollSlider) scrollSlider.value = seatMapContainer.scrollLeft; });
    
    // タッチムーブ補完
    seatGrid.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const currX = touch.clientX;
        const currY = touch.clientY;
        if (lastX !== null && lastY !== null) processLine(lastX, lastY, currX, currY);
        else processPoint(currX, currY);
        lastX = currX;
        lastY = currY;
    }, { passive: false });

    function resetDrag() { isDragging = false; lastProcessedSeatId = null; dragAction = null; lastX = null; lastY = null; }
    window.addEventListener('mouseup', resetDrag);
    window.addEventListener('touchend', resetDrag);
    window.addEventListener('touchcancel', resetDrag);
    window.addEventListener('resize', updateSliderRange);

    // --- 起動 ---
    function initApp() {
        loadData();
    }
    checkAuth();
});
