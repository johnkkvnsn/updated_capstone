/**
 * BFMSS AI Assistant — Floating Chatbot Widget
 * Powered by the Claude API (Anthropic). Reads the logged-in user's
 * Treasurer / SK financial summary (income, expenses, balances, budgets)
 * from the local DB so it can answer questions about the barangay's
 * Daily, Monthly, Quarterly, and Yearly reports.
 */

const BFMSS_CHATBOT = {
  open: false,
  history: [],

  // ─── BUILD CONTEXT FROM DB ──────────────────────────────
  async buildContext() {
    const user = DB.getCurrentUser();
    if (!user) return '';
    const role = DB.getRoleLabel ? DB.getRoleLabel(user.roleId) : DB.getRoleName(user.roleId);
    const brgy = await DB.getBarangay(user.barangayId) || { name: 'N/A', municipality: '', province: '' };
    const roleName = DB.getRoleName(user.roleId);

    let lines = [
      `User: ${user.fullName} (${role})`,
      `Barangay: ${brgy.name}, ${brgy.municipality}, ${brgy.province}`,
    ];

    if (roleName === 'treasurer' || roleName === 'sk_treasurer') {
      const isSK = roleName === 'sk_treasurer';
      const incomeKey = isSK ? 'sk_income' : 'income';
      const expenseKey = isSK ? 'sk_expenses' : 'expenses';
      const income = await DB.filter(incomeKey, { barangayId: user.barangayId });
      const expenses = await DB.filter(expenseKey, { barangayId: user.barangayId });
      const totalIncome = income.filter(i => i.status === 'approved').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
      const totalExpenses = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + parseFloat(e.amount || 0), 0);

      lines.push(`Module: ${isSK ? 'Sangguniang Kabataan (SK) Funds' : 'Barangay General Fund'}`);
      lines.push(`Total Approved Income (all-time): ₱${totalIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
      lines.push(`Total Approved Expenses (all-time): ₱${totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
      lines.push(`Net Fund Balance: ₱${(totalIncome - totalExpenses).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);

      // Recent transactions (last 5 of each)
      const recentIncome = [...income].sort((a, b) => b.dateReceived.localeCompare(a.dateReceived)).slice(0, 5);
      const recentExpenses = [...expenses].sort((a, b) => b.dateSpent.localeCompare(a.dateSpent)).slice(0, 5);
      if (recentIncome.length) {
        lines.push('Recent Income Records:');
        recentIncome.forEach(i => lines.push(`  - ${i.dateReceived}: ${i.source} (${i.category}) — ₱${i.amount.toLocaleString('en-PH')} [${i.status}]`));
      }
      if (recentExpenses.length) {
        lines.push('Recent Expense Records:');
        recentExpenses.forEach(e => lines.push(`  - ${e.dateSpent}: ${e.description} (${e.category}) — ₱${e.amount.toLocaleString('en-PH')} [${e.status}]`));
      }

      if (!isSK) {
        const budget = await DB.getCurrentBudget(user.barangayId);
        if (budget) lines.push(`Current Fiscal Year Budget (${budget.fiscalYear}): Total ₱${budget.totalBudget.toLocaleString('en-PH')}, Allocated ₱${budget.allocatedAmount.toLocaleString('en-PH')}, Remaining ₱${budget.remainingAmount.toLocaleString('en-PH')}`);
      }

      // Submitted reports
      const reportsAll = await DB.filter('reports', { barangayId: user.barangayId });
      const reports = reportsAll.filter(r => isSK ? r.module === 'sk' : r.module !== 'sk');
      if (reports.length) {
        lines.push('Submitted Reports:');
        reports.slice(-5).forEach(r => lines.push(`  - ${r.title} [${r.status}] (Period: ${r.period})`));
      }
    }

    return lines.join('\n');
  },

  // ─── UI INJECTION ────────────────────────────────────────
  init() {
    if (document.getElementById('bfmss-chatbot-root')) return;
    const root = document.createElement('div');
    root.id = 'bfmss-chatbot-root';
    root.innerHTML = `
      <button id="bfmss-chat-toggle" title="Ask the BFMSS AI Assistant">
        <i class="bi bi-robot"></i>
      </button>
      <div id="bfmss-chat-panel">
        <div id="bfmss-chat-header">
          <div class="bfmss-chat-title"><i class="bi bi-robot"></i> BFMSS AI Assistant</div>
          <button id="bfmss-chat-close"><i class="bi bi-x-lg"></i></button>
        </div>
        <div id="bfmss-chat-messages"></div>
        <div id="bfmss-chat-suggestions"></div>
        <div id="bfmss-chat-inputbar">
          <textarea id="bfmss-chat-input" rows="1" placeholder="Ask about your income, expenses, or reports..."></textarea>
          <button id="bfmss-chat-send"><i class="bi bi-send-fill"></i></button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    document.getElementById('bfmss-chat-toggle').addEventListener('click', () => this.toggle());
    document.getElementById('bfmss-chat-close').addEventListener('click', () => this.toggle(false));
    document.getElementById('bfmss-chat-send').addEventListener('click', () => this.send());
    const input = document.getElementById('bfmss-chat-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    this.renderWelcome();
    this.renderSuggestions();
  },

  renderWelcome() {
    const user = DB.getCurrentUser();
    const roleName = user ? DB.getRoleName(user.roleId) : null;
    let greeting = `Hi ${user ? user.fullName.split(' ')[0] : 'there'}! 👋 I'm your BFMSS AI Assistant.`;
    if (roleName === 'sk_treasurer') {
      greeting += ' I can help explain your SK income, expenses, fund balance, and how your Daily/Monthly/Yearly reports are computed.';
    } else if (roleName === 'treasurer') {
      greeting += ' I can help explain your barangay income, expenses, budget, and how your Daily/Monthly/Yearly reports are computed.';
    } else {
      greeting += ' Ask me anything about the Barangay Financial Management Streamlining System.';
    }
    this.appendMessage('assistant', greeting);
  },

  renderSuggestions() {
    const user = DB.getCurrentUser();
    const roleName = user ? DB.getRoleName(user.roleId) : null;
    let suggestions = [];
    if (roleName === 'sk_treasurer') {
      suggestions = [
        'What is our current SK fund balance?',
        'How do I generate a monthly SK report?',
        'Summarize our SK expenses this year',
      ];
    } else if (roleName === 'treasurer') {
      suggestions = [
        'What is our net balance right now?',
        'Explain how the yearly report is computed',
        'How much of our budget is left?',
      ];
    } else {
      suggestions = [
        'How do I generate a financial report?',
        'What does this system do?',
      ];
    }
    const el = document.getElementById('bfmss-chat-suggestions');
    el.innerHTML = suggestions.map(s => `<button class="bfmss-suggestion-chip">${s}</button>`).join('');
    el.querySelectorAll('.bfmss-suggestion-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('bfmss-chat-input').value = btn.textContent;
        this.send();
      });
    });
  },

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    const panel = document.getElementById('bfmss-chat-panel');
    const toggleBtn = document.getElementById('bfmss-chat-toggle');
    if (this.open) {
      panel.classList.add('show');
      toggleBtn.classList.add('active');
      document.getElementById('bfmss-chat-input').focus();
    } else {
      panel.classList.remove('show');
      toggleBtn.classList.remove('active');
    }
  },

  appendMessage(role, text) {
    const messages = document.getElementById('bfmss-chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `bfmss-msg bfmss-msg-${role}`;
    bubble.innerHTML = `<div class="bfmss-msg-bubble">${this.escapeAndFormat(text)}</div>`;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  },

  escapeAndFormat(text) {
    const div = document.createElement('div');
    div.textContent = text;
    let escaped = div.innerHTML;
    // Basic markdown-ish formatting: bold + line breaks + bullet lists
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  },

  async send() {
    const input = document.getElementById('bfmss-chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('bfmss-chat-suggestions').innerHTML = '';

    this.appendMessage('user', text);
    this.history.push({ role: 'user', content: text });

    const typingBubble = this.appendMessage('assistant', '…');
    typingBubble.classList.add('bfmss-typing');

    const context = await this.buildContext();
    const systemPrompt = `You are the AI Assistant embedded in the Barangay Financial Management Streamlining System (BFMSS), a capstone project for barangay and SK (Sangguniang Kabataan) treasurers in the Philippines. You help the logged-in user understand their financial records, fund balances, budgets, and how the Daily, Monthly, Quarterly, and Yearly reports are automatically generated from their recorded income and expenses (the "Report Frequency" feature in Generate Reports). Be concise, friendly, and helpful. You may answer in English or Filipino/Taglish depending on how the user writes. Always base numeric answers on the data context provided. If asked something outside the system's scope, answer briefly and helpfully as a general assistant. Here is the current user's data context:\n\n${context}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: this.history.slice(-10),
        }),
      });
      const data = await response.json();
      const reply = (data.content || []).map(c => c.text || '').join('\n').trim() || "Sorry, I couldn't generate a response.";
      typingBubble.remove();
      this.appendMessage('assistant', reply);
      this.history.push({ role: 'assistant', content: reply });
    } catch (err) {
      typingBubble.remove();
      this.appendMessage('assistant', 'Sorry, I ran into an error reaching the AI service. Please try again.');
      console.error('BFMSS Chatbot error:', err);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  // Only show the chatbot for logged-in users
  if (DB.getCurrentUser && DB.getCurrentUser()) {
    BFMSS_CHATBOT.init();
  }
});
