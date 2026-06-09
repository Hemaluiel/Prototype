const API = ""; 

// STATE

let mainBalance = 0;   // loaded from DB
let pockets = [];
let selectedPocketIndex = 0;
let current = 0;

async function loadMainBalance() {
    try {
        const res = await fetch(`${API}/balance`);
        if (!res.ok) throw new Error("Failed to fetch balance");
        const data = await res.json();
        mainBalance = data.balance;
        updateBalanceDisplay();
    } catch (err) {
        console.error("loadMainBalance:", err);
    }
}

function updateBalanceDisplay() {
    const el = document.getElementById("mainBalanceDisplay");
    const totalPockets = pockets.reduce((sum, p) => sum + p.amount, 0);
    if (el) el.innerText = `Available Balance: Nu. ${(mainBalance + totalPockets).toLocaleString()}`;
}


// POCKETS

async function loadPocketsFromDB() {
    try {
        const res = await fetch(`${API}/pockets`);
        if (!res.ok) throw new Error("Failed to fetch pockets");
        pockets = await res.json();
        pockets.forEach(p => p.amount = parseFloat(p.amount) || 0);
    } catch (err) {
        console.error("loadPocketsFromDB:", err);
        pockets = [];
    }
}

async function createPocket() {
    const name     = document.getElementById("pName").value.trim();
    const amount   = parseFloat(document.getElementById("pAmount").value);
    const start    = document.getElementById("pStart").value;
    const duration = parseInt(document.getElementById("pDuration").value);
    const type     = document.getElementById("pType").value;

    if (!name || !amount || !start || !duration) {
        alert("Please fill all fields!");
        return;
    }

    const totalUsed = pockets.reduce((sum, p) => sum + p.amount, 0);
    if (totalUsed + amount > mainBalance) {
        alert("Not enough balance in main account!");
        return;
    }

    try {
        const res = await fetch(`${API}/pockets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, amount, start, duration, type })
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        pockets.push({ id: data.id, name, amount, start, duration, type });

        alert("Pocket created!");
        await loadMainBalance();
        await loadPocketsFromDB();
        updatePockets();
        goTo(0);

        document.getElementById("pName").value = "";
        document.getElementById("pAmount").value = "";
        document.getElementById("pStart").value = "";
        document.getElementById("pDuration").value = "";

    } catch (err) {
        alert("Error creating pocket: " + err.message);
        console.error(err);
    }
}

async function saveEdit() {
    const name     = document.getElementById("editName").value.trim();
    const amount   = parseFloat(document.getElementById("editAmount").value);
    const start    = document.getElementById("editStart").value;
    const duration = parseInt(document.getElementById("editDuration").value);
    const type     = document.getElementById("editType").value;

    if (!name || !amount || !start || !duration) {
        alert("Please fill all fields!");
        return;
    }

    const totalUsed = pockets.reduce((sum, p, i) =>
        i !== selectedPocketIndex ? sum + p.amount : sum, 0
    );

    if (totalUsed + amount > mainBalance) {
        alert("Not enough balance!");
        return;
    }

    const pocket = pockets[selectedPocketIndex];

    try {
        const res = await fetch(`${API}/pockets/${pocket.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, amount, start, duration, type })
        });

        if (!res.ok) throw new Error(await res.text());

        pockets[selectedPocketIndex] = { ...pocket, name, amount, start, duration, type };

        alert("Pocket updated!");
        updatePockets();
        goTo(0);

    } catch (err) {
        alert("Error updating pocket: " + err.message);
        console.error(err);
    }
}

function updatePockets() {
    const totalUsed = pockets.reduce((sum, p) => sum + p.amount, 0);
    const remaining = mainBalance - totalUsed;

    if (selectedPocketIndex >= pockets.length) selectedPocketIndex = 0;

    if (pockets.length === 0) {
        document.getElementById("pocketSummary").innerHTML =
            `<b>Available Balance: Nu.${remaining.toLocaleString()}</b><br><br>
             <p style="color:#888;">No pockets yet. Create one!</p>`;
        return;
    }

    const selected = pockets[selectedPocketIndex];

    let html = `
        <b>Available Balance: Nu.${remaining.toLocaleString()}</b><br><br>
        <div style="display:flex; overflow-x:auto; gap:8px; margin-bottom:10px; padding-bottom:4px;">
    `;

    pockets.forEach((p, index) => {
        html += `
            <button class="btn ${index === selectedPocketIndex ? 'primary' : 'secondary'}"
                style="white-space:nowrap;"
                onclick="selectPocket(${index})">
                ${p.name}
            </button>
        `;
    });

    html += `</div>`;
    html += `
        <div class="card" style="cursor:pointer;" onclick="openEditScreen(${selectedPocketIndex})">
            <h4>${selected.name}</h4>
            <p>💰 Balance: <b>Nu.${parseFloat(selected.amount).toLocaleString()}</b></p>
            <p>📅 Start: ${selected.start ? selected.start.slice(0,10) : "—"}</p>
            <p>⏱ Duration: ${selected.duration} ${selected.type}</p>
            <small style="color:#888;">Tap to edit ✏️</small>
        </div>
    `;

    document.getElementById("pocketSummary").innerHTML = html;
}

function selectPocket(index) {
    selectedPocketIndex = index;
    updatePockets();
}

function openEditScreen(index) {
    const p = pockets[index];
    selectedPocketIndex = index;

    document.getElementById("editName").value     = p.name;
    document.getElementById("editAmount").value   = p.amount;
    document.getElementById("editStart").value    = p.start ? p.start.slice(0,10) : "";
    document.getElementById("editDuration").value = p.duration;
    document.getElementById("editType").value     = p.type;

    goTo(4);
}


// ACCOUNTS DROPDOWN

function loadAccounts() {
    const select = document.getElementById("accountSelect");
    select.innerHTML = "";

    const mainOpt = document.createElement("option");
    mainOpt.value = "main";
    mainOpt.text  = `Main Account (Nu.${mainBalance.toLocaleString()})`;
    select.appendChild(mainOpt);

    pockets.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.text  = `Pocket: ${p.name} (Nu.${parseFloat(p.amount).toLocaleString()})`;
        select.appendChild(opt);
    });
}


//  TRANSFER

function makeTransfer() {
    const account         = document.getElementById("accountSelect").value;
    const amount          = parseFloat(document.getElementById("amountInput").value);
    const receiverAccount = document.getElementById("receiverInput").value.trim();

    if (!selectedCategory) { alert("Please select a category!"); return; }
    if (!amount || !receiverAccount) { alert("Please fill amount and receiver!"); return; }

    const category = selectedCategory;

    if (account === "main") {
        if (amount > mainBalance) { alert("Insufficient main balance!"); return; }
        mainBalance -= amount;
    } else {
        const pocketIdx = pockets.findIndex(p => String(p.id) === String(account));
        if (pocketIdx === -1) { alert("Pocket not found!"); return; }
        if (amount > pockets[pocketIdx].amount) { alert("Not enough in pocket!"); return; }
        pockets[pocketIdx].amount -= amount;
    }

    const today = new Date().toISOString().slice(0, 10);

    fetch(`${API}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, category, receiverAccount, source: account, date: today })
    })
    .then(res => {
        if (!res.ok) throw new Error("Server error");
        return res.json();
    })
    .then(() => {
        alert("Transfer Successful!");

        updatePockets();
        loadMainBalance();   // refresh real balance from DB
        setTimeout(updateDashboard, 200);
        updateSuggestion();
        goTo(0);

        document.getElementById("amountInput").value   = "";
        document.getElementById("receiverInput").value = "";
        document.getElementById("descInput").value     = "";
        selectedCategory = null;
        document.getElementById("catSelectedText").innerHTML = "Select a category";
        document.querySelectorAll(".cat-option").forEach(el => el.classList.remove("active"));

        const total = document.getElementById("totalExpense");
        total.style.color = "green";
        setTimeout(() => { total.style.color = "black"; }, 1500);
    })
    .catch(err => {
        alert("Transfer failed: " + err.message);
        console.error(err);
    });
}


// AUTO-CATEGORY

const categories = [
    { label: "Groceries" },
    { label: "Dining & Food" },
    { label: "Transport" },
    { label: "Shopping" },
    { label: "Bills & Utilities" },
    { label: "Rent" },
    { label: "Health & Medical" },
    { label: "Education" },
    { label: "Entertainment" },
    { label: "Subscriptions" },
    { label: "Mobile & Data" },
    { label: "Travel" },
    { label: "Personal Care" },
    { label: "Family and Friends" },
    { label: "Contributions and Donations" },
    { label: "Gifts and Celebrations" },
    { label: "Others" }
];

let selectedCategory = null;
let autoSuggestedCat = null;

function autoCategorize(text) {
    text = text.toLowerCase();
    if (text.includes("vegetable") || text.includes("grocery") || text.includes("market"))   return "Groceries";
    if (text.includes("restaurant") || text.includes("meal") || text.includes("food") || text.includes("snack") || text.includes("dinner") || text.includes("dining") || text.includes("drink")) return "Dining & Food";
    if (text.includes("taxi") || text.includes("bus") || text.includes("fuel"))               return "Transport";
    if (text.includes("shop") || text.includes("store") || text.includes("mall"))             return "Shopping";
    if (text.includes("electricity") || text.includes("water") || text.includes("bill"))      return "Bills & Utilities";
    if (text.includes("rent") || text.includes("house rent") || text.includes("apartment"))   return "Rent";
    if (text.includes("hospital") || text.includes("medical") || text.includes("pharmacy"))   return "Health & Medical";
    if (text.includes("school") || text.includes("college") || text.includes("fee"))          return "Education";
    if (text.includes("movie") || text.includes("game") || text.includes("netflix"))          return "Entertainment";
    if (text.includes("subscription"))                                                         return "Subscriptions";
    if (text.includes("mobile") || text.includes("data") || text.includes("recharge") || text.includes("talk time")) return "Mobile & Data";
    if (text.includes("flight") || text.includes("hotel") || text.includes("travel"))         return "Travel";
    if (text.includes("salon") || text.includes("hair") || text.includes("spa") || text.includes("cream") || text.includes("shampoo")) return "Personal Care";
    if (text.includes("semso") || text.includes("charity") || text.includes("contribution") || text.includes("donation") || text.includes("rest in peace")) return "Contributions and Donations";
    if (text.includes("birthday") || text.includes("gift") || text.includes("celebration") || text.includes("party") || text.includes("marriage")) return "Gifts and Celebrations";
    if (text.includes("friend") || text.includes("relative") || text.includes("family"))      return "Family and Friends";
    return "Others";
}

function renderCategories() {
    const opts = document.getElementById("catOptions");
    if (!opts) return;
    opts.innerHTML = "";

    categories.forEach(cat => {
        const div = document.createElement("div");
        div.className = "cat-option";
        div.dataset.label = cat.label;
        div.innerHTML = `
            <span class="cat-opt-label">${cat.label}</span>
        `;
        div.addEventListener("click", () => {
            pickCategory(cat.label, false);
            closeCatDropdown();
        });
        opts.appendChild(div);
    });
}

function pickCategory(label, auto = false) {
    selectedCategory = label;

    const badge = auto ? `<span class="cat-auto-badge">✨ Auto-detected</span>` : "";

    document.getElementById("catSelectedText").innerHTML =
        `<span>${label}</span>${badge}`;

    document.querySelectorAll(".cat-option").forEach(el => {
        el.classList.remove("active");
        const oldPill = el.querySelector(".cat-auto-pill");
        if (oldPill) oldPill.remove();

        if (el.dataset.label === label) {
            el.classList.add("active");
            if (auto) {
                const pill = document.createElement("span");
                pill.className = "cat-auto-pill";
                pill.textContent = "Auto";
                el.appendChild(pill);
            }
        }
    });
}

function toggleCatDropdown() {
    const opts  = document.getElementById("catOptions");
    const arrow = document.getElementById("catArrow");
    const open  = opts.classList.toggle("open");
    arrow.classList.toggle("open", open);
    if (open) {
        const active = opts.querySelector(".cat-option.active");
        if (active) active.scrollIntoView({ block: "nearest" });
    }
}

function closeCatDropdown() {
    document.getElementById("catOptions").classList.remove("open");
    document.getElementById("catArrow").classList.remove("open");
}

document.addEventListener("click", e => {
    const wrapper = document.querySelector(".cat-dropdown-wrapper");
    if (wrapper && !wrapper.contains(e.target)) closeCatDropdown();
});


// SUGGESTION

function updateSuggestion() {}


// DASHBOARD

function updateDashboard() {
    const selector      = document.getElementById("monthSelector");
    const now           = new Date();
    const localMonth    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const selectedMonth = (selector && selector.value) ? selector.value : localMonth;

    fetch(`${API}/transactions/all`)
    .then(res => res.json())
    .then(data => {
        const totals = {};

        data.forEach(t => {
            const d = new Date(t.date);
            if (isNaN(d)) return;
            const txnMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (txnMonth !== selectedMonth) return;
            const cat = t.category || "Others";
            totals[cat] = (totals[cat] || 0) + Number(t.amount);
        });

        const labels = Object.keys(totals);
        const values = Object.values(totals);

        if (values.length === 0) {
            document.getElementById("totalExpense").innerText = "No expenses for this month";
            if (window.myChart) { window.myChart.destroy(); window.myChart = null; }
            return;
        }

        const totalExpense = values.reduce((a, b) => a + b, 0);
        document.getElementById("totalExpense").innerText =
            "Total: Nu. " + totalExpense.toLocaleString();

        const ctx = document.getElementById("expenseChart").getContext("2d");
        if (window.myChart) window.myChart.destroy();

        window.myChart = new Chart(ctx, {
            type: "pie",
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        "#003f88","#1e88e5","#42a5f5","#ff7043","#4caf50",
                        "#9c27b0","#ff9800","#e91e63","#00bcd4","#8bc34a",
                        "#f44336","#673ab7","#009688","#ff5722","#607d8b","#ffc107"
                    ]
                }]
            },
            options: {
                plugins: {
                    legend: { position: "bottom", labels: { font: { size: 10 } } }
                }
            }
        });
    })
    .catch(err => console.error("Dashboard error:", err));
}

//
function buildMonthSelector() {
    const selector = document.getElementById("monthSelector");
    if (!selector) return;

    selector.innerHTML = "";
    const now = new Date();

    for (let i = 0; i < 3; i++) {
        const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const label = d.toLocaleString("default", { month: "long", year: "numeric" });
        const opt   = document.createElement("option");
        opt.value   = value;
        opt.text    = label;
        if (i === 0) opt.selected = true;
        selector.appendChild(opt);
    }

    selector.addEventListener("change", updateDashboard);

    // Call AFTER dropdown is built so selector.value is correct
    updateDashboard();
}


// MINI STATEMENT

function showTransactions(type, btn) {
    document.querySelectorAll(".filterBtn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const list = document.getElementById("transactionList");

    if (type === "custom") {
        const now     = new Date();
        const maxDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        list.innerHTML = `
            <div style="margin:8px 0;">
                <label><b>Pick a date:</b></label>
                <input type="date" id="customDate" max="${maxDate}"
                    style="width:100%; margin-top:4px;">
                <button class="btn primary" style="width:100%; margin-top:8px;"
                    onclick="loadByDate()">Show Transactions</button>
            </div>
        `;
        return;
    }

    list.innerHTML = `<p style="color:#888; text-align:center;">Loading…</p>`;

    if (type === "today") {
        fetch(`${API}/transactions/all`)
        .then(res => res.json())
        .then(data => {
            const now   = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const filtered = data.filter(t => {
                const d     = new Date(t.date);
                const tDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                return tDate === today;
            });
            renderTransactionList(filtered, list);
        })
        .catch(() => { list.innerHTML = `<p style="color:red;">Failed to load</p>`; });
        return;
    }

    // last 50
    fetch(`${API}/transactions/all`)
    .then(res => res.json())
    .then(data => {
        renderTransactionList(data.slice(0, 50), list);
    })
    .catch(() => { list.innerHTML = `<p style="color:red;">Failed to load</p>`; });
}

function loadByDate() {
    const dateVal = document.getElementById("customDate").value;
    if (!dateVal) { alert("Please select a date!"); return; }

    const list = document.getElementById("transactionList");
    list.innerHTML = `<p style="color:#888; text-align:center;">Loading…</p>`;

    fetch(`${API}/transactions/date/${dateVal}`)
    .then(res => res.json())
    .then(data => renderTransactionList(data, list))
    .catch(() => { list.innerHTML = `<p style="color:red;">Failed to load</p>`; });
}

function renderTransactionList(data, container) {
    if (!data || data.length === 0) {
        container.innerHTML = `<p style="color:#888; text-align:center;">No transactions found.</p>`;
        return;
    }

    container.innerHTML = data.map(t => {
        const dateStr = t.date ? new Date(t.date).toLocaleDateString("en-IN",
            { day:"2-digit", month:"short", year:"numeric" }) : "—";
        return `
            <div class="transaction">
                <span style="font-size:12px;"><b>${t.category || "Others"}</b></span>
                <span style="float:right; color:#003f88; font-weight:bold; font-size:12px;">
                    Nu. ${parseFloat(t.amount).toLocaleString()}
                </span>
                <br>
                <small style="color:#888; font-size:11px;">Acc: ${t.receiver_account} · ${dateStr}</small>
            </div>
        `;
    }).join("");
}




// NAVIGATION 

function showScreen(i) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById("screen" + i).classList.add("active");
    document.getElementById("footerNav").style.display = i === 0 ? "none" : "flex";
}

function goTo(i) {
    const screen = document.getElementById("screen" + i);
    if (!screen) return;
    current = i;
    showScreen(i);
    if (i === 1) loadAccounts();
    if (i === 3) showTransactions("last50", document.querySelector(".filterBtn"));
}

function nextScreen() {
    current = current === 0 ? 1 : 0;
    showScreen(current);
}

function prevScreen() {
    current = 0;
    showScreen(0);
}


// INIT

window.onload = async function () {
    renderCategories();
    showScreen(0);

    await loadMainBalance();
    await loadPocketsFromDB();
    updatePockets();
    buildMonthSelector();   // calls updateDashboard internally after dropdown is ready
    updateSuggestion();

    function handleAutoCategory() {
        const text =
            document.getElementById("receiverInput").value + " " +
            document.getElementById("descInput").value;
        pickCategory(autoCategorize(text), true);
    }

    document.getElementById("receiverInput").addEventListener("input", handleAutoCategory);
    document.getElementById("descInput").addEventListener("input", handleAutoCategory);
};
