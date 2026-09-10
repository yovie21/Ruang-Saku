"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { ThemeToggle, InstallButton } from "./theme";

type Account = { id: string; name: string; account_type: string; account_number_last4: string | null; currency: string; current_balance: number; opening_balance?: number };
type Transaction = { id: string; title: string; note?: string | null; category: string | null; category_id: string | null; account: string | null; account_id: string | null; amount: number; transaction_date: string; type: "income" | "expense" | "transfer_in" | "transfer_out" | "adjustment"; transfer_group_id: string | null; receipt_name: string | null; has_receipt: number | boolean };
type Category = { id: string; name: string; type: string; color: string | null; is_default: number | boolean; usage_count?: number };
type ConfirmDialog = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void> };
type ToastItem = { id: number; kind: "success" | "error" | "warning"; title: string; message?: string };
type Budget = { id: string; budget: number; month_start: string; category_id: string; category: string };
type Goal = { id: string; name: string; target_amount: number; deadline: string | null; saved: number; deposits: number };
type GoalAllocation = { id: string; amount: number; allocation_date: string; note: string | null; account: string | null };
type Recurring = { id: string; title: string; type: "income" | "expense"; amount: number; frequency: string; start_date: string; next_run_date: string; end_date: string | null; is_active: number | boolean; note: string | null; category: string | null; account: string | null; category_id: string | null; account_id: string | null };
type SplitMember = { id: string; name: string; share_amount: number; paid_amount: number };
type Split = { id: string; title: string; total_amount: number; split_date: string; note: string | null; account: string | null; members: SplitMember[]; shared: number; paid: number; remaining: number };
type Debt = { id: string; kind: "debt" | "receivable"; person: string; amount: number; paid: number; remaining: number; due_date: string | null; note: string | null; created_at: string; updated_at?: string; installments?: number | null; installments_paid?: number | null };
type EditingTransfer = { groupId: string; title: string; amount: number; date: string; note: string; outAccountId: string; inAccountId: string; outTxId: string };
type GuideStep = { title: string; body: string };

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const formatDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const formatRibuan = (value: string) => {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};
const parseRibuan = (value: string) => Number(value.replace(/\./g, "").replace(/[^0-9]/g, ""));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function normalizeIDR(raw: string): number {
  let s = raw.replace(/\s/g, "");
  if (!/\d/.test(s)) return 0;
  const dec = s.match(/([.,])\d{1,2}$/);
  const int = dec ? s.slice(0, dec.index) : s;
  return parseInt(int.replace(/[^\d]/g, "") || "0", 10);
}

function parseReceiptText(raw: string): { amount: number; date: string; merchant: string } {
  const text = raw || "";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const numToken = /R?p\.?\s*([\d][\d.,]*)|([\d][\d.,]*\d)/gi;
  const lineValues: { line: string; value: number }[] = [];
  for (const line of lines) {
    numToken.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = numToken.exec(line)) !== null) {
      const v = normalizeIDR(m[1] ?? m[2] ?? m[0]);
      if (v > 0) lineValues.push({ line, value: v });
    }
  }
  const totalKw = /total|jumlah|bayar|tunai|cash|tagihan|amount|grand/i;
  const excludeKw = /kembali|change|tanggal|date|telp|phone|nota|kasir|jam|waktu|transaksi|struk|receipt/i;
  const totalCands = lineValues.filter(x => totalKw.test(x.line) && !excludeKw.test(x.line)).map(x => x.value);
  const bigCands = lineValues.map(x => x.value).filter(v => v >= 1000);
  const allVals = lineValues.map(x => x.value);
  const amount = totalCands.length > 0
    ? Math.max(...totalCands)
    : bigCands.length > 0 ? Math.max(...bigCands) : allVals.length > 0 ? Math.max(...allVals) : 0;

  let date = "";
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", jun: "06", jul: "07", agu: "08", sep: "09", okt: "10", nov: "11", des: "12" };
  outer: for (const pass of [0, 1]) {
    for (const line of lines) {
      if (pass === 0) {
        const m = line.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})/);
        if (m) {
          const d = Number(m[1]), mo = Number(m[2]);
          let y = Number(m[3]);
          if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
            if (m[3].length === 2) y = y <= 69 ? 2000 + y : 1900 + y;
            date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            break outer;
          }
        }
      } else {
        const m = line.toLowerCase().match(/(\d{1,2})\s+(jan\w*|feb\w*|mar\w*|apr\w*|mei|jun\w*|jul\w*|agu\w*|sep\w*|okt\w*|nov\w*|des\w*)\s+(\d{2}|\d{4})/);
        if (m) {
          const d = Number(m[1]);
          const mo = months[m[2].slice(0, 3)];
          let y = Number(m[3]);
          if (d >= 1 && d <= 31 && mo) {
            if (m[3].length === 2) y = y <= 69 ? 2000 + y : 1900 + y;
            date = `${y}-${mo}-${String(d).padStart(2, "0")}`;
            break outer;
          }
        }
      }
    }
  }

  let merchant = "";
  for (const line of lines.slice(0, 8)) {
    const clean = line.replace(/[^A-Za-z0-9&'.\- ]/g, "").trim();
    if (clean.length >= 3 && clean.length <= 45 && /[A-Za-z]{3,}/.test(clean)
      && !/struk|nota|receipt|telp|phone|jalan|^jl\b|cashier|kasir|tanggal|date/i.test(clean)) {
      merchant = clean.slice(0, 60);
      break;
    }
  }
  return { amount, date, merchant };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense" | null>(null);
  const [accountModal, setAccountModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [menu, setMenu] = useState(false);
  const [activeNav, setActiveNav] = useState<"beranda" | "transaksi" | "akun">("beranda");
  const [loading, setLoading] = useState(true);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [balanceDisplay, setBalanceDisplay] = useState("");
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetDisplay, setBudgetDisplay] = useState("");
  const [transferModal, setTransferModal] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmountDisplay, setTransferAmountDisplay] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalModal, setGoalModal] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTargetDisplay, setGoalTargetDisplay] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [allocModal, setAllocModal] = useState<Goal | null>(null);
  const [allocDirection, setAllocDirection] = useState<"deposit" | "withdraw">("deposit");
  const [allocAccount, setAllocAccount] = useState("");
  const [allocAmountDisplay, setAllocAmountDisplay] = useState("");
  const [allocNote, setAllocNote] = useState("");
  const [allocHistory, setAllocHistory] = useState<GoalAllocation[]>([]);
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryTab, setCategoryTab] = useState<"expense" | "income">("expense");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#286c56");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [recurringModal, setRecurringModal] = useState(false);
  const [recTitle, setRecTitle] = useState("");
  const [recType, setRecType] = useState<"income" | "expense">("expense");
  const [recCategory, setRecCategory] = useState("");
  const [recAccount, setRecAccount] = useState("");
  const [recAmountDisplay, setRecAmountDisplay] = useState("");
  const [recFrequency, setRecFrequency] = useState("monthly");
  const [recStart, setRecStart] = useState("");
  const [recEnd, setRecEnd] = useState("");
  const [reportModal, setReportModal] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);
  const [receiptView, setReceiptView] = useState<{ mime: string; name: string; data: string } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState<{ title: string; type: string; category: string; account: string; amount: number; date: string }[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [splits, setSplits] = useState<Split[]>([]);
  const [splitModal, setSplitModal] = useState(false);
  const [splitTitle, setSplitTitle] = useState("");
  const [splitTotalDisplay, setSplitTotalDisplay] = useState("");
  const [splitAccount, setSplitAccount] = useState("");
  const [splitDate, setSplitDate] = useState("");
  const [splitNames, setSplitNames] = useState("");
  const [payModal, setPayModal] = useState<{ split: Split; member: SplitMember } | null>(null);
  const [payAmountDisplay, setPayAmountDisplay] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanFileName, setScanFileName] = useState("");
  const [scanPreview, setScanPreview] = useState("");
  const scanRef = useRef<{ url: string; mime: string; name: string; text: string } | null>(null);
  const recurringRan = useRef(false);
  const reportAutoRan = useRef(false);
  const warnedBudgets = useRef<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("ruang-saku-notif-read");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
    } catch { return []; }
  });
  const [pushOn, setPushOn] = useState(false);
  const pushFired = useRef<Set<string>>(new Set());
  const [prevBudgets, setPrevBudgets] = useState<Budget[]>([]);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedDay, setSelectedDay] = useState("");
  const [privacyHide, setPrivacyHide] = useState(() => {
    try { return localStorage.getItem("ruang-saku-privacy") === "1"; } catch { return false; }
  });
  const [locked, setLocked] = useState(() => {
    try { return !!localStorage.getItem("ruang-saku-pin"); } catch { return false; }
  });
  const [pinModal, setPinModal] = useState<"set" | "unlock" | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [hasPin, setHasPin] = useState(() => {
    try { return !!localStorage.getItem("ruang-saku-pin"); } catch { return false; }
  });
  const [hasBio, setHasBio] = useState(() => {
    try { return !!localStorage.getItem("ruang-saku-bio-id"); } catch { return false; }
  });
  const [bioSupported, setBioSupported] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [pinJustSet, setPinJustSet] = useState(false);
  const [carryBusy, setCarryBusy] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccName, setEditAccName] = useState("");
  const [editAccType, setEditAccType] = useState("bank");
  const [editAccLast4, setEditAccLast4] = useState("");
  const [editAccBalanceDisplay, setEditAccBalanceDisplay] = useState("");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [txDate, setTxDate] = useState(() => todayStr());
  const [transferDate, setTransferDate] = useState(() => todayStr());
  const [editingTransfer, setEditingTransfer] = useState<EditingTransfer | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editBudgetDisplay, setEditBudgetDisplay] = useState("");
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editGoalName, setEditGoalName] = useState("");
  const [editGoalTargetDisplay, setEditGoalTargetDisplay] = useState("");
  const [editGoalDeadline, setEditGoalDeadline] = useState("");
  const [editingRec, setEditingRec] = useState<Recurring | null>(null);
  const [editRecTitle, setEditRecTitle] = useState("");
  const [editRecType, setEditRecType] = useState<"income" | "expense">("expense");
  const [editRecCategory, setEditRecCategory] = useState("");
  const [editRecAccount, setEditRecAccount] = useState("");
  const [editRecAmountDisplay, setEditRecAmountDisplay] = useState("");
  const [editRecFrequency, setEditRecFrequency] = useState("monthly");
  const [editRecStart, setEditRecStart] = useState("");
  const [editRecEnd, setEditRecEnd] = useState("");
  const [editingSplit, setEditingSplit] = useState<Split | null>(null);
  const [editSplitTitle, setEditSplitTitle] = useState("");
  const [editSplitTotalDisplay, setEditSplitTotalDisplay] = useState("");
  const [editSplitAccount, setEditSplitAccount] = useState("");
  const [editSplitDate, setEditSplitDate] = useState("");
  const [editSplitNote, setEditSplitNote] = useState("");
  const [editSplitNames, setEditSplitNames] = useState("");
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [editDebtPerson, setEditDebtPerson] = useState("");
  const [editDebtKind, setEditDebtKind] = useState<"debt" | "receivable">("debt");
  const [editDebtAmountDisplay, setEditDebtAmountDisplay] = useState("");
  const [editDebtTimes, setEditDebtTimes] = useState("");
  const [editDebtDue, setEditDebtDue] = useState("");
  const [editDebtNote, setEditDebtNote] = useState("");
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtModal, setDebtModal] = useState(false);
  const [debtKind, setDebtKind] = useState<"debt" | "receivable">("debt");
  const [debtPerson, setDebtPerson] = useState("");
  const [debtAmountDisplay, setDebtAmountDisplay] = useState("");
  const [debtTimes, setDebtTimes] = useState("");
  const [debtDue, setDebtDue] = useState("");
  const [debtNote, setDebtNote] = useState("");
  const [debtOpen, setDebtOpen] = useState(false);
  const [debtHistory, setDebtHistory] = useState<Debt[]>([]);
  const [debtHistoryOpen, setDebtHistoryOpen] = useState(false);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [payDebtCategory, setPayDebtCategory] = useState("");
  const [payDebtAccount, setPayDebtAccount] = useState("");
  const [guideModal, setGuideModal] = useState(false);

  async function shaPin(pin: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ruang-saku:" + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function bufToB64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64ToBuf(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  useEffect(() => {
    // Deteksi dukungan WebAuthn platform authenticator (sidik jari / face / Windows Hello).
    (async () => {
      try {
        if (typeof window === "undefined" || !window.isSecureContext) { setBioSupported(false); return; }
        const webauthn = typeof (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential !== "undefined";
        if (!webauthn) { setBioSupported(false); return; }
        const PKC = (window as unknown as { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
        if (typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
          setBioSupported(await PKC.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false));
        } else {
          setBioSupported(true);
        }
      } catch { setBioSupported(false); }
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ruang-saku-notif-read", JSON.stringify(readIds.slice(-200)));
    } catch { /* abaikan */ }
  }, [readIds]);

  function markNotifRead(id?: string) {
    setReadIds(prev => {
      const next = id ? [...prev, id] : [...prev, ...notifItems.map(n => n.id)];
      return [...new Set(next)].slice(-300);
    });
  }

  async function enablePush() {
    if (typeof Notification === "undefined") {
      pushToast("error", "Tidak didukung", "Browser ini tidak mendukung notifikasi.");
      return;
    }
    if (Notification.permission === "granted") {
      setPushOn(true);
      pushToast("success", "Pengingat aktif", "Notifikasi browser menyala untuk hal penting.");
      return;
    }
    const perm = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
    if (perm === "granted") {
      setPushOn(true);
      pushToast("success", "Pengingat aktif", "Kamu akan diberi tahu soal anggaran jebol & jadwal.");
    } else {
      pushToast("warning", "Izin ditolak", "Aktifkan izin notifikasi di pengaturan browser bila berubah pikiran.");
    }
  }

  function pushToast(kind: "success" | "error" | "warning", title: string, message?: string) {
    toastId.current += 1;
    const id = toastId.current;
    setToasts(t => [...t, { id, kind, title, message }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }

  async function handleConfirm() {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
  }

  async function loadData() {
    const nowD = new Date();
    const monthStart = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-01`;
    const prevD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
    const prevStart = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}-01`;
    const [accRes, txRes, catRes, budRes, prevBudRes, goalRes, recRes, splitRes, debtRes, debtHistRes] = await Promise.all([
      fetch("/api/accounts"), fetch("/api/transactions"), fetch("/api/categories?usage=1"),
      fetch(`/api/budgets?month=${monthStart}`), fetch(`/api/budgets?month=${prevStart}`),
      fetch("/api/goals"), fetch("/api/recurring"), fetch("/api/splits"), fetch("/api/debts"), fetch("/api/debts?history=1")
    ]);
    const accs = await accRes.json();
    const txs = await txRes.json();
    const cats = await catRes.json();
    const buds = await budRes.json();
    const prevBuds = await prevBudRes.json();
    const gls = await goalRes.json();
    const recs = await recRes.json();
    const spl = await splitRes.json();
    const dbs = await debtRes.json().catch(() => []);
    const dhist = await debtHistRes.json().catch(() => []);
    setAccounts(Array.isArray(accs) ? accs : []); setTransactions(Array.isArray(txs) ? txs : []); setCategories(Array.isArray(cats) ? cats : []);
    setBudgets(Array.isArray(buds) ? buds : []);
    setPrevBudgets(Array.isArray(prevBuds) ? prevBuds : []);
    setGoals(Array.isArray(gls) ? gls : []);
    setRecurring(Array.isArray(recs) ? recs : []);
    setSplits(Array.isArray(spl) ? spl : []);
    setDebts(Array.isArray(dbs) ? dbs : []);
    setDebtHistory(Array.isArray(dhist) ? dhist : []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (recurringRan.current) return;
    recurringRan.current = true;
    (async () => {
      try {
        const res = await fetch("/api/recurring/run", { method: "POST" });
        const result = await res.json().catch(() => ({}));
        if (Number(result.created) > 0) {
          pushToast("success", "Jadwal rutin dijalankan", `${result.created} transaksi otomatis dibuat.`);
          await loadData();
        } else if (Array.isArray(result.skipped) && result.skipped.length > 0) {
          pushToast("warning", "Jadwal dilewati", `Saldo kurang: ${result.skipped.slice(0, 3).join(", ")}.`);
        }
      } catch { /* abaikan, tidak blokir UI */ }
    })();
  }, []);

  useEffect(() => {
    if (reportAutoRan.current) return;
    reportAutoRan.current = true;
    const now = new Date();
    if (now.getDate() > 7) return; // hanya minggu pertama tiap bulan
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    let seen = "";
    try {
      seen = localStorage.getItem("ruang-saku-report-seen") || "";
    } catch { /* abaikan */ }
    if (seen === prevKey) return;
    const t = window.setTimeout(() => {
      setReportMonth(prevKey);
      setReportModal(true);
      try {
        localStorage.setItem("ruang-saku-report-seen", prevKey);
      } catch { /* abaikan */ }
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  const total = useMemo(() => accounts.reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);
  const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter(t => {
      if (filter === "income" && t.type !== "income") return false;
      if (filter === "expense" && t.type !== "expense") return false;
      if (filter === "transfer" && !(t.type === "transfer_in" || t.type === "transfer_out")) return false;
      const day = String(t.transaction_date).slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (q) {
        const hay = `${t.title || ""} ${t.category || ""} ${t.account || ""} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filter, search, dateFrom, dateTo]);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, filter]);

  function exportCsv() {
    if (visible.length === 0) {
      pushToast("error", "Tidak ada data", "Tidak ada transaksi untuk diekspor.");
      return;
    }
    const header = ["Tanggal", "Judul", "Tipe", "Kategori", "Akun", "Nominal"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const typeLabel = (t: string) => t === "income" ? "Pemasukan" : t === "expense" ? "Pengeluaran" : t === "transfer_in" ? "Transfer masuk" : t === "transfer_out" ? "Transfer keluar" : t;
    const lines = [header.map(esc).join(";")];
    for (const t of visible) {
      lines.push([String(t.transaction_date).slice(0, 10), t.title || "", typeLabel(t.type), t.category || "Lainnya", t.account || "-", t.amount].map(esc).join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ruang-saku-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast("success", "CSV diunduh", `${visible.length} transaksi diekspor.`);
  }

  function openEdit(t: Transaction) {
    setEditing(t);
    setEditTitle(t.title || "");
    setEditCategory(t.category || "");
    // Simpan sebagai account_id (stabil); fallback ke lookup nama bila id belum ada
    // agar rename/arsip/duplikat nama tidak merusak payload.
    setEditAccount(t.account_id || "");
    setEditAmount(new Intl.NumberFormat("id-ID").format(Number(t.amount)));
    setEditDate(String(t.transaction_date).slice(0, 10));
  }

  function closeEdit() {
    setEditing(null);
  }

  async function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const amount = parseRibuan(editAmount);
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    if (!editTitle.trim()) {
      pushToast("error", "Nama belum diisi", "Isi nama transaksi dulu.");
      return;
    }
    // Resolve akun: prioritas by id (stabil), lalu by nama, lalu id lama dari transaksi.
    // Ini membuat ubah tanggal saja tidak gagal saat akun di-rename / duplikat nama / terarsip.
    const accById = accounts.find(a => a.id === editAccount)
      ?? accounts.find(a => a.name === editAccount);
    const resolvedAccountId = accById?.id ?? editing.account_id ?? null;
    // Jangan kirim UUID sebagai nama: bila editAccount adalah id asli transaksi
    // (kasus akun diarsip sehingga tak ada di dropdown), fallback ke nama lama.
    const isOriginalId = editAccount && editing.account_id && editAccount === editing.account_id;
    const fallbackAccountName = accById?.name ?? (isOriginalId ? (editing.account || null) : (editAccount || editing.account || null));
    if (!resolvedAccountId && !fallbackAccountName) {
      pushToast("error", "Akun tidak ditemukan", "Pilih akun yang tersedia.");
      return;
    }
    const payload = {
      id: editing.id, title: editTitle.trim(), amount,
      type: editing.type, category: editCategory,
      account_id: resolvedAccountId,
      account: fallbackAccountName,
      transaction_date: editDate || String(editing.transaction_date).slice(0, 10)
    };
    // Langsung simpan tanpa dialog konfirmasi; toast sukses sebagai penanda.
    const response = await fetch("/api/transactions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const detail = result.code ? `${result.error ?? "Coba lagi sebentar."} [${result.code}]` : (result.error ?? "Coba lagi sebentar.");
      pushToast("error", "Gagal menyimpan perubahan", detail);
      return;
    }
    setEditing(null);
    pushToast("success", "Transaksi diperbarui", `${payload.title} • ${rupiah(amount)}`);
    await loadData();
  }

  const trend30 = useMemo(() => {
    const days: { key: string; label: string; income: number; expense: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
        income: 0, expense: 0
      });
    }
    const map = new Map(days.map(d => [d.key, d]));
    for (const t of transactions) {
      const key = String(t.transaction_date).slice(0, 10);
      const day = map.get(key);
      if (!day) continue;
      if (t.type === "income") day.income += Number(t.amount);
      else if (t.type === "expense") day.expense += Number(t.amount);
    }
    return days;
  }, [transactions]);
  const trendMax = Math.max(1, ...trend30.map(d => Math.max(d.income, d.expense)));

  const categoryColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      if (c.color) map.set(`${c.type}:${c.name}`, c.color);
    }
    return map;
  }, [categories]);

  const expenseByCategory = useMemo(() => {
    const sum = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const name = t.category || "Lainnya";
      sum.set(name, (sum.get(name) ?? 0) + Number(t.amount));
    }
    const totalExp = [...sum.values()].reduce((s, v) => s + v, 0) || 1;
    const palette = ["#286c56", "#3e77cf", "#ed705f", "#c98a2d", "#7c5cc9", "#2aa5a0", "#8ca39e"];
    return [...sum.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, pct: (value / totalExp) * 100, color: categoryColor.get(`expense:${name}`) ?? palette[i % palette.length] }));
  }, [transactions, categoryColor]);
  const donutSegments = useMemo(() => {
    let acc = 0;
    return expenseByCategory.map(s => {
      const from = acc;
      acc += s.pct;
      return { ...s, from, to: acc };
    });
  }, [expenseByCategory]);
  const donutBackground = donutSegments.length === 0
    ? "#edf2ee"
    : `conic-gradient(${donutSegments.map(s => `${s.color} ${s.from}% ${s.to}%`).join(", ")})`;

  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const monthExpenseByCategory = useMemo(() => {
    const sum = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (String(t.transaction_date).slice(0, 7) !== monthKey) continue;
      const name = t.category || "Lainnya";
      sum.set(name, (sum.get(name) ?? 0) + Number(t.amount));
    }
    return sum;
  }, [transactions, monthKey]);

  const budgetProgress = useMemo(() => budgets.map(b => {
    const spent = monthExpenseByCategory.get(b.category) ?? 0;
    const limit = Number(b.budget) || 0;
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    const status: "safe" | "warn" | "over" = pct >= 100 ? "over" : pct >= 80 ? "warn" : "safe";
    return { ...b, spent, limit, pct, status };
  }), [budgets, monthExpenseByCategory]);

  const monthKeyPrev = useMemo(() => {
    const d = new Date();
    const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const prevMonthSpentByCategory = useMemo(() => {
    const sum = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (String(t.transaction_date).slice(0, 7) !== monthKeyPrev) continue;
      const name = t.category || "Lainnya";
      sum.set(name, (sum.get(name) ?? 0) + Number(t.amount));
    }
    return sum;
  }, [transactions, monthKeyPrev]);

  const carrySuggestions = useMemo(() => prevBudgets
    .map(pb => {
      const limit = Number(pb.budget) || 0;
      const spent = prevMonthSpentByCategory.get(pb.category) ?? 0;
      const leftover = Math.max(0, limit - spent);
      const exists = budgets.some(b => b.category === pb.category);
      return { category: pb.category, limit, spent, leftover, exists };
    })
    .filter(x => x.leftover > 0 && !x.exists), [prevBudgets, prevMonthSpentByCategory, budgets]);

  async function carryOverBudget(category: string, leftover: number) {
    const nowD = new Date();
    const monthStart = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-01`;
    setCarryBusy(true);
    try {
      const response = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount: leftover, month_start: monthStart })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        pushToast("error", "Carry-over gagal", result.error ?? "Coba lagi sebentar.");
        return;
      }
      pushToast("success", "Sisa dialihkan", `${category} • ${rupiah(leftover)} jadi modal bulan ini`);
      await loadData();
    } finally {
      setCarryBusy(false);
    }
  }

  async function carryOverAll() {
    if (carrySuggestions.length === 0) return;
    setCarryBusy(true);
    try {
      let ok = 0;
      for (const s of carrySuggestions) {
        const nowD = new Date();
        const monthStart = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-01`;
        const response = await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: s.category, amount: s.leftover, month_start: monthStart })
        });
        if (response.ok) ok += 1;
      }
      pushToast("success", "Carry-over selesai", `${ok} kategori dialihkan ke bulan ini`);
      await loadData();
    } finally {
      setCarryBusy(false);
    }
  }

  const calData = useMemo(() => {
    const [cy, cm] = calMonth.split("-").map(Number);
    const firstDow = new Date(cy, cm - 1, 1).getDay();
    const daysInMonth = new Date(cy, cm, 0).getDate();
    const byDay = new Map<string, { income: number; expense: number; count: number; txs: Transaction[] }>();
    for (const t of transactions) {
      const key = String(t.transaction_date).slice(0, 10);
      if (!key.startsWith(calMonth)) continue;
      const e = byDay.get(key) ?? { income: 0, expense: 0, count: 0, txs: [] };
      if (t.type === "income") e.income += Number(t.amount);
      else if (t.type === "expense") e.expense += Number(t.amount);
      e.count += 1;
      e.txs.push(t);
      byDay.set(key, e);
    }
    const maxOut = Math.max(1, ...[...byDay.values()].map(d => d.expense));
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: `${calMonth}-${String(d).padStart(2, "0")}` });
    }
    let mIn = 0, mOut = 0;
    for (const e of byDay.values()) { mIn += e.income; mOut += e.expense; }
    return { cells, byDay, maxOut, mIn, mOut, label: new Date(cy, cm - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }) };
  }, [calMonth, transactions]);

  const selectedDayTxs = useMemo(() => {
    if (!selectedDay) return [];
    const e = calData.byDay.get(selectedDay);
    return e ? [...e.txs].sort((a, b) => Number(b.amount) - Number(a.amount)) : [];
  }, [selectedDay, calData]);

  function shiftCalMonth(delta: number) {
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDay("");
  }

  function showDay(dayKey: string) {
    setSelectedDay(dayKey);
    setDateFrom(dayKey);
    setDateTo(dayKey);
    setFilter("all");
    setPage(1);
    scrollToSection("transaksi");
  }

  function togglePrivacy() {
    setPrivacyHide(prev => {
      const next = !prev;
      try { localStorage.setItem("ruang-saku-privacy", next ? "1" : "0"); } catch { /* abaikan */ }
      return next;
    });
  }

  function maskRp(n: number): string {
    return privacyHide ? "Rp ••••••" : rupiah(n);
  }

  function maskNum(n: number | string): string {
    return privacyHide ? "••••••" : String(n);
  }

  async function submitPin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pinInput)) {
      pushToast("error", "PIN tidak valid", "PIN 4–6 digit angka.");
      return;
    }
    if (pinModal === "set") {
      const hash = await shaPin(pinInput);
      try { localStorage.setItem("ruang-saku-pin", hash); } catch { /* abaikan */ }
      setLocked(true);
      setHasPin(true);
      setPinInput("");
      // Langsung tawarkan biometrik setelah PIN dibuat (tanpa menutup modal dulu
      // bila perangkat mendukung — user tinggal tempel jari/wajah sekali).
      if (bioSupported && !hasBio) {
        setPinJustSet(true);
        pushToast("success", "PIN aktif", "Tempel sidik jari / wajah untuk mengaktifkan biometrik.");
        const ok = await registerBiometric();
        setPinJustSet(false);
        setPinModal(null);
        if (!ok) pushToast("success", "PIN aktif", "Aplikasi dikunci. Biometrik bisa diaktifkan nanti.");
      } else {
        setPinModal(null);
        pushToast("success", "PIN aktif", bioSupported ? "Aplikasi dikunci. Buka dengan PIN tiap sesi." : "Aplikasi dikunci. Perangkat ini tidak mendukung biometrik.");
      }
    } else if (pinModal === "unlock") {
      let saved = "";
      try { saved = localStorage.getItem("ruang-saku-pin") || ""; } catch { /* abaikan */ }
      const hash = await shaPin(pinInput);
      if (hash === saved && saved) {
        setLocked(false);
        setPinModal(null);
        setPinInput("");
      } else {
        pushToast("error", "PIN salah", "Coba lagi.");
      }
    }
  }

  function randomChallenge(): Uint8Array {
    const c = new Uint8Array(32);
    crypto.getRandomValues(c);
    return c;
  }

  function bioUserId(): Uint8Array {
    // ID user stabil per perangkat agar kredensial passkey konsisten.
    try {
      const saved = localStorage.getItem("ruang-saku-bio-user");
      if (saved) return b64ToBuf(saved);
    } catch { /* abaikan */ }
    const id = new Uint8Array(16);
    crypto.getRandomValues(id);
    try { localStorage.setItem("ruang-saku-bio-user", bufToB64(id.buffer as ArrayBuffer)); } catch { /* abaikan */ }
    return id;
  }

  // Daftarkan sidik jari / wajah / Windows Hello di perangkat ini (cukup sekali).
  async function registerBiometric(): Promise<boolean> {
    if (bioBusy) return false;
    if (typeof window === "undefined" || !window.isSecureContext) {
      pushToast("error", "Biometrik butuh HTTPS", "Buka lewat https:// atau localhost.");
      return false;
    }
    const PKC = (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    if (!PKC) {
      pushToast("error", "Perangkat tidak mendukung", "Browser ini tidak punya WebAuthn.");
      return false;
    }
    setBioBusy(true);
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge() as unknown as ArrayBuffer,
          rp: { name: "Ruang Saku" },
          user: {
            id: bioUserId() as unknown as ArrayBuffer,
            name: session?.user?.email ?? "pengguna-ruang-saku",
            displayName: session?.user?.name ?? "Pengguna Ruang Saku",
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      }) as unknown as { rawId: ArrayBuffer } | null;
      if (!cred?.rawId) {
        pushToast("warning", "Pendaftaran dibatalkan", "Coba lagi bila ingin mengaktifkan.");
        return false;
      }
      try { localStorage.setItem("ruang-saku-bio-id", bufToB64(cred.rawId)); } catch { /* abaikan */ }
      setHasBio(true);
      pushToast("success", "Biometrik aktif", "Buka kunci dengan sidik jari / wajah mulai sekarang.");
      return true;
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      if (name === "NotAllowedError") {
        pushToast("warning", "Pendaftaran dibatalkan", "Kamu membatalkan dialog biometrik.");
      } else if (name === "NotSupportedError") {
        pushToast("error", "Tidak didukung", "Perangkat ini tidak punya sensor biometrik platform.");
      } else if (name === "SecurityError") {
        pushToast("error", "Biometrik butuh HTTPS", "Buka lewat https:// atau localhost.");
      } else {
        pushToast("error", "Pendaftaran gagal", (e as Error)?.message || "Coba lagi.");
      }
      return false;
    } finally {
      setBioBusy(false);
    }
  }

  async function unlockWithBiometric() {
    if (bioBusy) return;
    if (typeof window === "undefined" || !window.isSecureContext) {
      pushToast("error", "Biometrik butuh HTTPS", "Buka lewat https:// atau localhost, atau pakai PIN.");
      return;
    }
    let allowCredentials: { id: ArrayBuffer; type: string; transports?: AuthenticatorTransport[] }[] | undefined;
    try {
      const savedId = localStorage.getItem("ruang-saku-bio-id");
      if (savedId) allowCredentials = [{ id: b64ToBuf(savedId).buffer as ArrayBuffer, type: "public-key", transports: ["internal"] }];
    } catch { /* abaikan */ }
    if (!allowCredentials) {
      // Belum pernah didaftarkan di perangkat ini: tawarkan pendaftaran langsung.
      pushToast("warning", "Biometrik belum didaftarkan", "Daftarkan sidik jari / wajah dulu.");
      const ok = await registerBiometric();
      if (ok) { setLocked(false); setPinModal(null); setPinInput(""); }
      return;
    }
    setBioBusy(true);
    try {
      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge() as unknown as ArrayBuffer,
          timeout: 60000,
          userVerification: "required",
          allowCredentials: allowCredentials as unknown as PublicKeyCredentialDescriptor[],
        },
      });
      if (cred) {
        setLocked(false);
        setPinModal(null);
        setPinInput("");
        pushToast("success", "Terbuka", "Verifikasi biometrik berhasil.");
      }
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      if (name === "NotAllowedError") {
        pushToast("warning", "Verifikasi dibatalkan", "Gunakan PIN sebagai gantinya.");
      } else if (name === "InvalidStateError" || name === "NotFoundError") {
        // Kredensial hilang (data browser dihapus): daftar ulang.
        try { localStorage.removeItem("ruang-saku-bio-id"); } catch { /* abaikan */ }
        setHasBio(false);
        pushToast("warning", "Biometrik kedaluwarsa", "Data browser dihapus — daftarkan ulang.");
        const ok = await registerBiometric();
        if (ok) { setLocked(false); setPinModal(null); setPinInput(""); }
      } else {
        pushToast("warning", "Biometrik gagal", "Gunakan PIN sebagai gantinya.");
      }
    } finally {
      setBioBusy(false);
    }
  }

  function removePin() {
    // Langsung matikan tanpa dialog (konsisten: konfirmasi hanya untuk hapus data).
    try { localStorage.removeItem("ruang-saku-pin"); localStorage.removeItem("ruang-saku-bio-id"); } catch { /* abaikan */ }
    setLocked(false);
    setHasPin(false);
    setHasBio(false);
    setPinModal(null);
    setPinInput("");
    pushToast("success", "Kunci dimatikan");
  }

  const reportData = useMemo(() => {
    const [ry, rm] = reportMonth.split("-").map(Number);
    const prev = new Date(ry, rm - 2, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    let income = 0, expense = 0, prevIncome = 0, prevExpense = 0, count = 0;
    const catSum = new Map<string, number>();
    const list: Transaction[] = [];
    for (const t of transactions) {
      const key = String(t.transaction_date).slice(0, 7);
      if (key === reportMonth) {
        count += 1;
        list.push(t);
        if (t.type === "income") income += Number(t.amount);
        else if (t.type === "expense") {
          expense += Number(t.amount);
          const name = t.category || "Lainnya";
          catSum.set(name, (catSum.get(name) ?? 0) + Number(t.amount));
        }
      } else if (key === prevKey) {
        if (t.type === "income") prevIncome += Number(t.amount);
        else if (t.type === "expense") prevExpense += Number(t.amount);
      }
    }
    const net = income - expense;
    const rate = income > 0 ? ((income - expense) / income) * 100 : 0;
    const deltaIncome = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : (income > 0 ? 100 : 0);
    const deltaExpense = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : (expense > 0 ? 100 : 0);
    const topCats = [...catSum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, value]) => ({ name, value, pct: expense > 0 ? (value / expense) * 100 : 0, color: categoryColor.get(`expense:${name}`) ?? "#286c56" }));
    const topTx = [...list].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
    const monthLabel = new Date(ry, rm - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    // Rekonsiliasi: Saldo total saat ini = saldo awal semua akun + arus bulan ini + arus bulan lain.
    // Ini menjelaskan kenapa "arus bersih" laporan tidak sama dengan "saldo total" dashboard.
    const openingTotal = accounts.reduce((s, a) => s + Number(a.opening_balance ?? 0), 0);
    const currentTotal = accounts.reduce((s, a) => s + Number(a.current_balance), 0);
    const otherNet = currentTotal - openingTotal - net;
    return { income, expense, net, rate, prevIncome, prevExpense, deltaIncome, deltaExpense, topCats, topTx, count, monthLabel, list, openingTotal, currentTotal, otherNet };
  }, [transactions, reportMonth, categoryColor, accounts]);

  function exportReportCsv() {
    if (reportData.list.length === 0) {
      pushToast("error", "Tidak ada data", `Tidak ada transaksi pada ${reportData.monthLabel}.`);
      return;
    }
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const typeLabel = (t: string) => t === "income" ? "Pemasukan" : t === "expense" ? "Pengeluaran" : t === "transfer_in" ? "Transfer masuk" : t === "transfer_out" ? "Transfer keluar" : t;
    const lines = [["Tanggal", "Judul", "Tipe", "Kategori", "Akun", "Nominal"].map(esc).join(";")];
    for (const t of reportData.list) {
      lines.push([String(t.transaction_date).slice(0, 10), t.title || "", typeLabel(t.type), t.category || "Lainnya", t.account || "-", t.amount].map(esc).join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ruang-saku-${reportMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast("success", "CSV laporan diunduh", `${reportData.list.length} transaksi ${reportData.monthLabel}.`);
  }

  function printReport() {
    if (reportData.list.length === 0) {
      pushToast("error", "Tidak ada data", `Tidak ada transaksi pada ${reportData.monthLabel}.`);
      return;
    }
    document.body.classList.add("printing-report");
    // kecilkan jeda agar layout cetak stabil sebelum dialog print
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => document.body.classList.remove("printing-report"), 500);
    }, 60);
  }

  // Bangun file PDF laporan langsung di perangkat (tanpa server).
  // Font bawaan jsPDF hanya aman untuk ASCII, jadi nominal memakai
  // format "Rp" + titik ribuan dan tanda +/- biasa (tanpa simbol khusus).
  async function buildReportPdf(): Promise<{ blob: Blob; fileName: string }> {
    const { jsPDF } = await import("jspdf");
    const { autoTable } = await import("jspdf-autotable");
    const userName = session?.user?.name ?? "Pengguna";
    const printed = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const rupiahPdf = (n: number) => "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
    const typeLabel = (t: string) => t === "income" ? "Masuk" : t === "expense" ? "Keluar" : t === "transfer_in" ? "Trf masuk" : t === "transfer_out" ? "Trf keluar" : t;
    const rows = [...reportData.list].sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 40; // margin
    let y = 48;

    // Kop
    doc.setFillColor(40, 108, 86);
    doc.roundedRect(M, y - 26, 30, 30, 7, 7, "F");
    doc.setTextColor(217, 243, 72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("r", M + 11, y - 5);
    doc.setTextColor(25, 43, 41);
    doc.setFontSize(16);
    doc.text("ruangsaku", M + 40, y - 5);
    y += 22;

    doc.setFontSize(20);
    doc.text(`Rekap ${reportData.monthLabel}`, M, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 122, 118);
    doc.text(`${userName} - Dicetak ${printed} - ${reportData.count} transaksi`, M, y);
    y += 22;

    // 3 kartu ringkasan
    const cardW = (W - M * 2 - 16) / 3;
    const cards = [
      { label: `Masuk ${reportData.monthLabel}`, value: rupiahPdf(reportData.income), sub: `${reportData.deltaIncome >= 0 ? "+" : "-"}${Math.abs(reportData.deltaIncome).toFixed(0)}% vs bln lalu`, color: [21, 147, 84] as const },
      { label: `Keluar ${reportData.monthLabel}`, value: rupiahPdf(reportData.expense), sub: `${reportData.deltaExpense >= 0 ? "+" : "-"}${Math.abs(reportData.deltaExpense).toFixed(0)}% vs bln lalu`, color: [214, 74, 59] as const },
      { label: "Arus bersih (bkn saldo)", value: `${reportData.net >= 0 ? "+" : "-"}${rupiahPdf(Math.abs(reportData.net))}`, sub: `Nabung ${reportData.rate.toFixed(0)}% dari masuk`, color: reportData.net >= 0 ? [21, 147, 84] as const : [214, 74, 59] as const },
    ];
    cards.forEach((c, i) => {
      const x = M + i * (cardW + 8);
      doc.setDrawColor(228, 235, 230);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardW, 62, 8, 8, "FD");
      doc.setFontSize(9);
      doc.setTextColor(107, 122, 118);
      doc.text(c.label, x + 10, y + 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(c.color[0], c.color[1], c.color[2]);
      doc.text(c.value, x + 10, y + 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(107, 122, 118);
      doc.text(c.sub.slice(0, 30), x + 10, y + 50);
    });
    y += 78;

    // Top kategori keluar + bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(25, 43, 41);
    doc.text("Top kategori keluar", M, y);
    y += 14;
    const maxCat = Math.max(1, ...reportData.topCats.map(c => c.value));
    if (reportData.topCats.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(107, 122, 118);
      doc.text("Belum ada pengeluaran bulan ini.", M, y);
      y += 16;
    } else {
      for (const c of reportData.topCats) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(25, 43, 41);
        doc.text(c.name.slice(0, 32), M, y);
        const val = `${rupiahPdf(c.value)} (${c.pct.toFixed(0)}%)`;
        doc.text(val, W - M - doc.getTextWidth(val), y);
        y += 6;
        doc.setFillColor(232, 239, 233);
        doc.roundedRect(M, y, W - M * 2, 7, 3, 3, "F");
        doc.setFillColor(21, 147, 84);
        const bw = Math.max(4, ((c.value / maxCat) * (W - M * 2)));
        if (bw > 8) doc.roundedRect(M, y, bw, 7, 3, 3, "F");
        y += 18;
        if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 48; }
      }
    }
    y += 6;

    // Tabel rincian transaksi
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(25, 43, 41);
    doc.text(`Rincian transaksi (${rows.length})`, M, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Tanggal", "Judul", "Tipe", "Kategori", "Akun", "Nominal"]],
      body: rows.map(t => {
        const neg = t.type === "expense" || t.type === "transfer_out";
        return [
          String(t.transaction_date).slice(0, 10),
          (t.title || "Tanpa judul").slice(0, 34),
          typeLabel(t.type),
          (t.category || "Lainnya").slice(0, 20),
          (t.account || "-").slice(0, 16),
          `${neg ? "-" : "+"}${rupiahPdf(Number(t.amount))}`,
        ];
      }),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: [25, 43, 41] },
      headStyles: { fillColor: [40, 108, 86], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [244, 248, 245] },
      columnStyles: { 5: { halign: "right", fontStyle: "bold" } },
      margin: { left: M, right: M },
      didDrawPage: () => {
        const pages = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(140, 150, 148);
        doc.text(`Ruang Saku - Rekap ${reportData.monthLabel} - hal ${pages}`, M, doc.internal.pageSize.getHeight() - 20);
      },
    });

    // Rekonsiliasi: jelaskan kenapa arus bersih != saldo total.
    let ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
    if (ry > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); ry = 48; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(25, 43, 41);
    doc.text("Kenapa beda dengan Saldo total?", M, ry);
    ry += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 122, 118);
    doc.text(`Arus bersih hanya arus ${reportData.monthLabel}. Saldo total mencakup saldo awal + seluruh riwayat.`, M, ry);
    ry += 16;
    const recon: [string, string][] = [
      ["Saldo awal semua akun", rupiahPdf(reportData.openingTotal)],
      [`Arus ${reportData.monthLabel} (masuk - keluar)`, `${reportData.net >= 0 ? "+" : "-"}${rupiahPdf(Math.abs(reportData.net))}`],
      ["Arus bulan lain + transfer", `${reportData.otherNet >= 0 ? "+" : "-"}${rupiahPdf(Math.abs(reportData.otherNet))}`],
      ["Saldo total saat ini", rupiahPdf(reportData.currentTotal)],
    ];
    doc.setFontSize(10);
    for (let i = 0; i < recon.length; i++) {
      const [label, val] = recon[i];
      const bold = i === recon.length - 1;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(25, 43, 41);
      doc.text(label, M, ry);
      doc.text(val, W - M - doc.getTextWidth(val), ry);
      ry += 14;
    }

    const blob = doc.output("blob");
    return { blob, fileName: `ruang-saku-rekap-${reportMonth}.pdf` };
  }

  async function shareReportPdf() {
    if (reportData.list.length === 0) {
      pushToast("error", "Tidak ada data", `Tidak ada transaksi pada ${reportData.monthLabel}.`);
      return;
    }
    let pdf: { blob: Blob; fileName: string };
    try {
      pdf = await buildReportPdf();
    } catch (e) {
      pushToast("error", "PDF gagal dibuat", (e as Error)?.message || "Coba lagi.");
      return;
    }
    const file = new File([pdf.blob], pdf.fileName, { type: "application/pdf" });
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; files?: File[] }) => Promise<void>; canShare?: (d: { files: File[] }) => boolean };
    try {
      if (typeof nav.share === "function" && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: `Rekap ${reportData.monthLabel}`,
          text: `Ruang Saku - Rekap ${reportData.monthLabel}: masuk ${rupiah(reportData.income)}, keluar ${rupiah(reportData.expense)}.`,
          files: [file],
        });
        return;
      }
    } catch {
      pushToast("warning", "Batal dibagikan", "Tidak jadi membagikan laporan.");
      return;
    }
    // Fallback: unduh file PDF langsung.
    const url = URL.createObjectURL(pdf.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdf.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast("success", "PDF laporan diunduh", `${reportData.count} transaksi ${reportData.monthLabel}.`);
  }

  const goalProgress = useMemo(() => goals.map(g => {
    const target = Number(g.target_amount) || 0;
    const saved = Number(g.saved) || 0;
    const pct = target > 0 ? (saved / target) * 100 : 0;
    const done = target > 0 && saved >= target;
    return { ...g, target, saved, pct, done };
  }), [goals]);

  type Insight = { level: "good" | "warn" | "bad" | "info"; title: string; detail: string; action?: string; target?: string };
  const insights = useMemo(() => {
    const out: Insight[] = [];
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
    let curIn = 0, curOut = 0, prevOut = 0;
    const curCat = new Map<string, number>();
    const prevCat = new Map<string, number>();
    const daily = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense" && t.type !== "income") continue;
      const key = String(t.transaction_date).slice(0, 7);
      const v = Number(t.amount);
      if (key === curKey) {
        if (t.type === "income") curIn += v;
        else {
          curOut += v;
          const n = t.category || "Lainnya";
          curCat.set(n, (curCat.get(n) ?? 0) + v);
          const day = String(t.transaction_date).slice(0, 10);
          daily.set(day, (daily.get(day) ?? 0) + v);
        }
      } else if (key === prevKey && t.type === "expense") {
        prevOut += v;
        prevCat.set(t.category || "Lainnya", (prevCat.get(t.category || "Lainnya") ?? 0) + v);
      }
    }
    // 1. Skor kesehatan
    let score = 50;
    if (curIn > 0) {
      const saveRate = (curIn - curOut) / curIn;
      score += Math.max(-30, Math.min(30, saveRate * 60));
    } else if (curOut > 0) score -= 20;
    if (budgetProgress.length > 0) {
      const over = budgetProgress.filter(b => b.status === "over").length;
      const warn = budgetProgress.filter(b => b.status === "warn").length;
      score -= over * 8 + warn * 3;
    }
    if (goals.length > 0) {
      const avg = goalProgress.reduce((s, g) => s + Math.min(100, g.pct), 0) / goals.length;
      score += Math.round((avg / 100) * 10);
    }
    if (prevOut > 0 && curOut > prevOut * 1.2) score -= 5;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const grade = score >= 80 ? "Sehat" : score >= 60 ? "Cukup" : score >= 40 ? "Waspada" : "Boros";
    out.push({
      level: score >= 60 ? "good" : score >= 40 ? "warn" : "bad",
      title: `Skor keuangan: ${score}/100 (${grade})`,
      detail: curIn > 0
        ? `Bulan ini masuk ${rupiah(curIn)}, keluar ${rupiah(curOut)}. Tingkat nabung ${(((curIn - curOut) / curIn) * 100).toFixed(0)}%.`
        : "Belum ada pemasukan tercatat bulan ini — skor turun.",
      action: "DETAIL_SKOR", target: String(score)
    });
    // 2. Kategori boros (naik >30% vs bulan lalu)
    const risers = [...curCat.entries()]
      .map(([name, cur]) => ({ name, cur, prev: prevCat.get(name) ?? 0 }))
      .filter(x => x.cur > 0 && (x.prev === 0 ? x.cur >= 200000 : x.cur > x.prev * 1.3))
      .sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev))
      .slice(0, 2);
    for (const r of risers) {
      const up = r.prev > 0 ? `naik ${(((r.cur - r.prev) / r.prev) * 100).toFixed(0)}% dari ${rupiah(r.prev)}` : `baru ${rupiah(r.cur)} bulan ini`;
      out.push({
        level: "warn", title: `Boros di ${r.name}`,
        detail: `Pengeluaran ${r.name} ${up}. Total ${rupiah(r.cur)} — porsi ${curOut > 0 ? ((r.cur / curOut) * 100).toFixed(0) : "0"}% dari belanja.`,
        action: "BUAT_ANGGARAN", target: r.name
      });
    }
    // 3. Lonjakan harian (anomali)
    if (daily.size >= 3) {
      const vals = [...daily.entries()].sort((a, b) => b[1] - a[1]);
      const avg = [...daily.values()].reduce((s, v) => s + v, 0) / daily.size;
      const top = vals[0];
      if (top[1] > avg * 2.5 && top[1] >= 100000) {
        out.push({
          level: "bad", title: `Lonjakan belanja ${new Date(top[0]).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`,
          detail: `Sehari habis ${rupiah(top[1])}, padahal rata-rata harian ${rupiah(Math.round(avg))}. Cek transaksi hari itu.`,
          action: "LIHAT_HARI", target: top[0]
        });
      }
    }
    // 4. Proyeksi akhir bulan
    const dayOfMonth = now.getDate();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (curOut > 0 && dayOfMonth >= 3) {
      const proj = (curOut / dayOfMonth) * dim;
      if (curIn > 0 && proj > curIn) {
        out.push({
          level: "bad", title: "Proyeksi bulan ini minus",
          detail: `Kecepatan belanja ${rupiah(Math.round(curOut / dayOfMonth))}/hari → proyeksi ${rupiah(Math.round(proj))}, melebihi pemasukan ${rupiah(curIn)}. Rem ${rupiah(Math.round(proj - curIn))} sampai akhir bulan.`,
          action: "ATUR_REM"
        });
      } else {
        out.push({
          level: "info", title: `Proyeksi belanja ${rupiah(Math.round(proj))}`,
          detail: `Hari ke-${dayOfMonth} dari ${dim} hari. Masih on-track dengan pola sekarang.`,
        });
      }
    }
    // 5. Anggaran jebol
    for (const b of budgetProgress.filter(x => x.status === "over").slice(0, 2)) {
      out.push({
        level: "bad", title: `Anggaran ${b.category} jebol ${b.pct.toFixed(0)}%`,
        detail: `Terpakai ${rupiah(b.spent)} dari ${rupiah(b.limit)}. Kelebihan ${rupiah(b.spent - b.limit)} — pangkas kategori ini minggu depan.`,
        action: "KURANGI", target: b.category
      });
    }
    // 6. Target segera tercapai
    for (const g of goalProgress.filter(x => !x.done && x.pct >= 70).slice(0, 2)) {
      out.push({
        level: "good", title: `${g.name} ${g.pct.toFixed(0)}% — sedikit lagi!`,
        detail: `Kurang ${rupiah(Math.max(0, g.target - g.saved))} dari ${rupiah(g.target)}. Sisihkan sekali lagi bulan ini.`,
        action: "NABUNG", target: g.name
      });
    }
    if (out.length <= 1) {
      out.push({
        level: "info", title: "Belum cukup data",
        detail: "Catat transaksi rutin beberapa hari agar wawasan muncul otomatis."
      });
    }
    return out;
  }, [transactions, budgetProgress, goals, goalProgress]);

  useEffect(() => {
    for (const b of budgetProgress) {
      if (b.status === "safe") continue;
      const key = `${b.id}-${b.status}`;
      if (warnedBudgets.current.has(key)) continue;
      warnedBudgets.current.add(key);
      if (b.status === "over") {
        pushToast("error", `Anggaran ${b.category} jebol`, `Terpakai ${rupiah(b.spent)} dari ${rupiah(b.limit)} (${b.pct.toFixed(0)}%).`);
      } else {
        pushToast("warning", `Anggaran ${b.category} menipis`, `Terpakai ${rupiah(b.spent)} dari ${rupiah(b.limit)} (${b.pct.toFixed(0)}%).`);
      }
    }
  }, [budgetProgress]);

  type Notif = { id: string; kind: "error" | "warning" | "success" | "info"; title: string; detail: string; action?: string; target?: string };
  const notifItems: Notif[] = useMemo(() => {
    const items: Notif[] = [];
    const today = todayStr();
    for (const b of budgetProgress) {
      if (b.status === "over") items.push({ id: `bud-over-${b.id}`, kind: "error", title: `Anggaran ${b.category} jebol`, detail: `${b.pct.toFixed(0)}% • ${rupiah(b.spent)} dari ${rupiah(b.limit)}`, action: "BUAT_ANGGARAN" });
      else if (b.status === "warn") items.push({ id: `bud-warn-${b.id}`, kind: "warning", title: `Anggaran ${b.category} menipis`, detail: `${b.pct.toFixed(0)}% • sisa ${rupiah(Math.max(0, b.limit - b.spent))}`, action: "BUAT_ANGGARAN" });
    }
    for (const r of recurring) {
      if (!r.is_active) continue;
      const next = String(r.next_run_date).slice(0, 10);
      if (next <= today) items.push({ id: `rec-${r.id}`, kind: "info", title: `Jadwal jatuh tempo: ${r.title}`, detail: `${r.type === "income" ? "+" : "-"}${rupiah(Number(r.amount))} • ${String(r.frequency) === "daily" ? "Harian" : String(r.frequency) === "weekly" ? "Mingguan" : String(r.frequency) === "yearly" ? "Tahunan" : "Bulanan"} • ${r.account ?? ""}`.trim() });
    }
    for (const g of goalProgress) {
      if (!g.done && g.pct >= 70) items.push({ id: `goal-${g.id}`, kind: "success", title: `${g.name} ${g.pct.toFixed(0)}%`, detail: `Kurang ${rupiah(Math.max(0, g.target - g.saved))} lagi`, action: "NABUNG", target: g.name });
      if (g.deadline) {
        const daysLeft = Math.ceil((new Date(String(g.deadline).slice(0, 10)).getTime() - new Date(today).getTime()) / 86400000);
        if (!g.done && daysLeft >= 0 && daysLeft <= 14) items.push({ id: `goal-dl-${g.id}`, kind: "warning", title: `Tenggat ${g.name} ${daysLeft} hari`, detail: `Target ${rupiah(g.target)}, terkumpul ${rupiah(g.saved)}`, action: "NABUNG", target: g.name });
      }
    }
    for (const s of splits) {
      if (s.remaining > 0) {
        const debtors = s.members.filter(m => Number(m.paid_amount) < Number(m.share_amount));
        items.push({ id: `split-${s.id}`, kind: "warning", title: `Patungan "${s.title}" belum lunas`, detail: debtors.length > 0 ? `Sisa ${rupiah(s.remaining)} • ${debtors.slice(0, 3).map(m => m.name).join(", ")}${debtors.length > 3 ? ` +${debtors.length - 3}` : ""} belum bayar` : `Sisa ${rupiah(s.remaining)}` });
      }
    }
    for (const d of debts) {
      const due = d.due_date ? String(d.due_date).slice(0, 10) : null;
      if (!due) continue;
      const rest = Math.max(0, Number(d.remaining ?? (Number(d.amount) - Number(d.paid))));
      if (rest <= 0) continue;
      const daysLeft = Math.ceil((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
      const label = d.kind === "debt" ? "Utang" : "Piutang";
      if (daysLeft < 0) items.push({ id: `debt-over-${d.id}`, kind: "error", title: `${label} ${d.person} lewat ${Math.abs(daysLeft)} hari`, detail: `Sisa ${rupiah(rest)} • jatuh tempo ${due}`, action: "LIHAT_UTANG", target: d.id });
      else if (daysLeft <= 7) items.push({ id: `debt-due-${d.id}`, kind: "warning", title: `${label} ${d.person} ${daysLeft} hari lagi`, detail: `Sisa ${rupiah(rest)} • jatuh tempo ${due}`, action: "LIHAT_UTANG", target: d.id });
    }
    for (const s of insights) {
      if (s.level === "bad") items.push({ id: `ins-${s.title}`, kind: "error", title: s.title, detail: s.detail, action: s.action, target: s.target });
    }
    if (new Date().getDate() <= 7) {
      const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const label = prev.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      const hasData = transactions.some(t => String(t.transaction_date).slice(0, 7) === prevKey);
      if (hasData) items.push({ id: `report-${prevKey}`, kind: "info", title: `Laporan ${label} siap`, detail: "Buka rekap, cetak PDF, atau bagikan ke chat.", action: "BUKA_LAPORAN", target: prevKey });
    }
    const rank: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 };
    return items.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 30);
  }, [budgetProgress, recurring, goalProgress, splits, debts, insights]);

  const unreadCount = notifItems.filter(n => !readIds.includes(n.id)).length;

  useEffect(() => {
    if (!pushOn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const n of notifItems) {
      if (n.kind !== "error") continue;
      if (pushFired.current.has(n.id)) continue;
      pushFired.current.add(n.id);
      try {
        new Notification(n.title, { body: n.detail, icon: "/icon-192.png" });
      } catch { /* abaikan */ }
      if (pushFired.current.size > 60) pushFired.current.clear();
    }
  }, [notifItems, pushOn]);

  async function submitTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const accountName = String(form.get("account"));
    const acc = accounts.find(a => a.name === accountName);
    if (!acc) {
      pushToast("error", "Akun tidak ditemukan", "Pilih akun yang tersedia dulu.");
      return;
    }
    const amount = parseRibuan(amountDisplay);
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    const title = String(form.get("title") || "Tanpa judul");
    const category = String(form.get("category") || "Lainnya");
    if (transactionType === "expense" && Number(acc.current_balance) < amount) {
      pushToast("error", "Saldo tidak cukup", `Saldo ${acc.name} ${rupiah(Number(acc.current_balance))}, butuh ${rupiah(amount)}.`);
      return;
    }
    const payload = { title, amount, type: transactionType, category, account_id: acc.id, transaction_date: txDate || todayStr() };
    const scanned = scanRef.current;
    // Langsung simpan tanpa dialog konfirmasi.
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const created = await response.json().catch(() => ({}));
    if (!response.ok) {
      pushToast("error", "Transaksi gagal disimpan", created.error ?? "Coba lagi sebentar.");
      return;
    }
    if (scanned && created.id) {
      try {
        const base64 = scanned.url.includes(",") ? scanned.url.split(",")[1] : scanned.url;
        await fetch(`/api/transactions/${created.id}/receipt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: base64, mime: scanned.mime, name: scanned.name })
        });
      } catch { /* struk opsional, abaikan */ }
    }
    formEl.reset();
    setAmountDisplay("");
    setTxDate(todayStr());
    setScanFileName("");
    setScanPreview("");
    scanRef.current = null;
    pushToast("success", "Transaksi tersimpan", `${title} • ${rupiah(amount)}`);
    await loadData();
  }

  function openTransactionDialog() {
    setTransactionType(null);
    setAmountDisplay("");
    setScanFileName("");
    setScanPreview("");
    setScanProgress(0);
    setTxDate(todayStr());
    scanRef.current = null;
    setOpen(true);
  }

  function closeTransactionDialog() {
    setOpen(false);
    setTransactionType(null);
    setAmountDisplay("");
    setScanProgress(0);
  }

  async function scanReceipt(file: File | undefined) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      pushToast("error", "Format tidak didukung", "Scan pakai foto JPG, PNG, atau WebP (bukan PDF).");
      return;
    }
    if (file.size > 4_000_000) {
      pushToast("error", "Foto terlalu besar", "Maksimal 4MB agar scan cepat.");
      return;
    }
    setScanBusy(true);
    setScanProgress(0);
    setScanFileName(file.name);
    try {
      const dataUrl = await fileToBase64(file);
      setScanPreview(dataUrl);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["ind", "eng"], undefined, {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setScanProgress(Math.round(m.progress * 100));
          }
        }
      });
      const { data } = await worker.recognize(dataUrl);
      await worker.terminate();
      const parsed = parseReceiptText(data.text || "");
      if (!parsed.amount || parsed.amount < 1) {
        pushToast("error", "Nominal tidak terbaca", "Foto kurang jelas — ketik nominal manual.");
        scanRef.current = null;
        return;
      }
      setAmountDisplay(new Intl.NumberFormat("id-ID").format(parsed.amount));
      const nameInput = document.querySelector('form.modal input[name="title"]') as HTMLInputElement | null;
      if (nameInput && !nameInput.value && parsed.merchant) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(nameInput, parsed.merchant);
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      scanRef.current = { url: dataUrl, mime: file.type, name: file.name, text: data.text || "" };
      pushToast("success", "Struk terbaca", `${parsed.merchant || "Transaksi"} • ${rupiah(parsed.amount)}${parsed.date ? ` • ${parsed.date}` : ""}. Cek lagi sebelum simpan.`);
    } catch {
      pushToast("error", "Scan gagal", "Coba foto ulang yang lebih jelas.");
      scanRef.current = null;
    } finally {
      setScanBusy(false);
      setScanProgress(0);
    }
  }

  async function submitAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get("name") || "").trim();
    const accountType = String(form.get("account_type") || "bank");
    // Opsional: kosong = null, tidak dikirim sebagai "" agar tampilan bersih ("—").
    const last4raw = String(form.get("last4") || "").replace(/\D/g, "").slice(-4);
    const last4 = last4raw ? last4raw : null;
    const openingBalance = parseRibuan(balanceDisplay);
    if (!name) {
      pushToast("error", "Nama akun belum diisi", "Isi nama akun dulu, misalnya BCA.");
      return;
    }
    const payload = { name, account_type: accountType, opening_balance: openingBalance, account_number_last4: last4 };
    // Langsung simpan tanpa dialog konfirmasi.
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Akun gagal disimpan", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setBalanceDisplay("");
    pushToast("success", "Akun tersimpan", `${name} • ${rupiah(openingBalance)}`);
    await loadData();
  }

  function openAccountModal() {
    setBalanceDisplay("");
    setAccountModal(true);
  }

  function closeAccountModal() {
    setAccountModal(false);
    setBalanceDisplay("");
  }

  function openEditAccount(a: Account) {
    setEditingAccount(a);
    setEditAccName(a.name);
    setEditAccType(a.account_type || "bank");
    setEditAccLast4(a.account_number_last4 || "");
    setEditAccBalanceDisplay(new Intl.NumberFormat("id-ID").format(Number(a.opening_balance ?? 0)));
  }

  function closeEditAccount() {
    setEditingAccount(null);
  }

  async function submitEditAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingAccount) return;
    const name = editAccName.trim();
    if (!name) {
      pushToast("error", "Nama akun belum diisi", "Isi nama akun dulu.");
      return;
    }
    const payload = {
      id: editingAccount.id,
      name,
      account_type: editAccType,
      account_number_last4: editAccLast4.trim() ? editAccLast4.trim().slice(-4) : null,
      opening_balance: parseRibuan(editAccBalanceDisplay),
    };
    // Langsung simpan tanpa dialog konfirmasi.
    const response = await fetch("/api/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Akun gagal diperbarui", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingAccount(null);
    pushToast("success", "Akun diperbarui", name);
    await loadData();
  }

  function deleteAccount(a: Account) {
    setConfirm({
      title: "Hapus akun?",
      message: `"${a.name}" (${maskRp(Number(a.current_balance))}) akan dihapus. Akun yang sudah dipakai transaksi akan diarsipkan agar riwayat tetap aman. Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        const response = await fetch(`/api/accounts?id=${a.id}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          pushToast("error", "Akun gagal dihapus", result.error ?? "Coba lagi sebentar.");
          return;
        }
        pushToast("success", result.archived ? "Akun diarsipkan" : "Akun dihapus", a.name);
        await loadData();
      }
    });
  }

  function scrollToSection(id: "beranda" | "transaksi" | "akun" | "utang") {
    if (id !== "utang") setActiveNav(id);
    setMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openBudgetModal() {
    setBudgetDisplay("");
    setBudgetModal(true);
  }

  function closeBudgetModal() {
    setBudgetModal(false);
    setBudgetDisplay("");
  }

  async function submitBudget(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const category = String(form.get("category") || "");
    const amount = parseRibuan(budgetDisplay);
    if (!category) {
      pushToast("error", "Kategori belum dipilih", "Pilih kategori pengeluaran dulu.");
      return;
    }
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal anggaran harus lebih dari Rp 0.");
      return;
    }
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const payload = { category, amount, month_start: monthStart };
    const response = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Anggaran gagal disimpan", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setBudgetDisplay("");
    pushToast("success", "Anggaran tersimpan", `${category} • ${rupiah(amount)}/bulan`);
    await loadData();
  }

  function openCategoryModal() {
    setCategoryTab("expense");
    setNewCategoryName("");
    setNewCategoryColor("#286c56");
    setEditingCategory(null);
    setCategoryModal(true);
    void refreshCategories();
  }

  function closeCategoryModal() {
    setCategoryModal(false);
    setEditingCategory(null);
  }

  async function refreshCategories() {
    try {
      const res = await fetch("/api/categories?usage=1");
      const rows = await res.json();
      if (Array.isArray(rows)) setCategories(rows);
    } catch {
      await loadData();
    }
  }

  async function submitCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const name = newCategoryName.trim();
    if (!name) {
      pushToast("error", "Nama belum diisi", "Contoh: Jajan, Langganan.");
      return;
    }
    const payload = { name, type: categoryTab, color: newCategoryColor };
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Kategori gagal ditambah", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setNewCategoryName("");
    pushToast("success", "Kategori ditambah", name);
    await refreshCategories();
    await loadData();
  }

  async function submitCategoryEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingCategory) return;
    const name = editingCategory.name.trim();
    if (!name) {
      pushToast("error", "Nama belum diisi", "Nama kategori tidak boleh kosong.");
      return;
    }
    const payload = { id: editingCategory.id, name, color: editingCategory.color };
    const response = await fetch("/api/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal menyimpan", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingCategory(null);
    pushToast("success", "Kategori diperbarui", name);
    await refreshCategories();
    await loadData();
  }

  function deleteCategory(c: Category) {
    const usage = Number(c.usage_count ?? 0);
    setConfirm({
      title: "Hapus kategori?",
      message: usage > 0
        ? `"${c.name}" dipakai ${usage} transaksi — akan diarsipkan agar riwayat tetap aman. Lanjutkan?`
        : `Hapus kategori "${c.name}" permanen? Lanjutkan?`,
      confirmLabel: usage > 0 ? "Ya, arsipkan" : "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/categories?id=${c.id}`, { method: "DELETE" });
        pushToast("success", usage > 0 ? "Kategori diarsipkan" : "Kategori dihapus");
        await refreshCategories();
        await loadData();
      }
    });
  }

  function deleteBudget(id: string, category: string) {
    setConfirm({
      title: "Hapus anggaran?",
      message: `Batas bulanan untuk "${category}" akan dihapus. Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/budgets?id=${id}`, { method: "DELETE" });
        pushToast("success", "Anggaran dihapus");
        await loadData();
      }
    });
  }

  const freqLabel = (f: string) => f === "daily" ? "Harian" : f === "weekly" ? "Mingguan" : f === "yearly" ? "Tahunan" : "Bulanan";

  function openRecurringModal() {
    setRecTitle("");
    setRecType("expense");
    setRecCategory(categories.find(c => c.type === "expense")?.name ?? "");
    setRecAccount(accounts[0]?.name ?? "");
    setRecAmountDisplay("");
    setRecFrequency("monthly");
    setRecStart(new Date().toISOString().slice(0, 10));
    setRecEnd("");
    setRecurringModal(true);
  }

  function closeRecurringModal() {
    setRecurringModal(false);
  }

  async function submitRecurring(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const title = recTitle.trim();
    const amount = parseRibuan(recAmountDisplay);
    if (!title) {
      pushToast("error", "Nama belum diisi", "Contoh: Gaji bulanan, Langganan Netflix.");
      return;
    }
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    const acc = accounts.find(a => a.name === recAccount);
    if (!acc) {
      pushToast("error", "Akun tidak ditemukan", "Pilih akun yang tersedia.");
      return;
    }
    const payload = {
      title, type: recType, amount, frequency: recFrequency,
      category: recCategory || null, account_id: acc.id,
      start_date: recStart || new Date().toISOString().slice(0, 10),
      next_run_date: recStart || new Date().toISOString().slice(0, 10),
      end_date: recEnd || null
    };
    const response = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Jadwal gagal dibuat", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setRecTitle("");
    setRecAmountDisplay("");
    pushToast("success", "Jadwal rutin dibuat", `${title} • ${rupiah(amount)}`);
    await loadData();
  }

  async function toggleRecurring(r: Recurring) {
    await fetch("/api/recurring", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, is_active: !r.is_active })
    });
    pushToast("success", r.is_active ? "Jadwal dijeda" : "Jadwal diaktifkan", r.title);
    await loadData();
  }

  function deleteRecurring(r: Recurring) {
    setConfirm({
      title: "Hapus jadwal?",
      message: `Hapus jadwal rutin "${r.title}"? Transaksi yang sudah dibuat tidak ikut terhapus.`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/recurring?id=${r.id}`, { method: "DELETE" });
        pushToast("success", "Jadwal dihapus");
        await loadData();
      }
    });
  }

  function openEditRecurring(r: Recurring) {
    setEditingRec(r);
    setEditRecTitle(r.title);
    setEditRecType(r.type === "income" ? "income" : "expense");
    setEditRecCategory(r.category ?? "");
    setEditRecAccount(r.account ?? "");
    setEditRecAmountDisplay(new Intl.NumberFormat("id-ID").format(Number(r.amount)));
    setEditRecFrequency(String(r.frequency || "monthly"));
    setEditRecStart(String(r.start_date || r.next_run_date || todayStr()).slice(0, 10));
    setEditRecEnd(r.end_date ? String(r.end_date).slice(0, 10) : "");
  }

  async function submitEditRecurring(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingRec) return;
    const title = editRecTitle.trim();
    const amount = parseRibuan(editRecAmountDisplay);
    if (!title) {
      pushToast("error", "Nama belum diisi", "Contoh: Gaji bulanan.");
      return;
    }
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    const acc = editRecAccount ? accounts.find(a => a.name === editRecAccount) : null;
    const cat = editRecCategory ? categories.find(c => c.name === editRecCategory && c.type === editRecType) : null;
    const response = await fetch("/api/recurring", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingRec.id, title, amount, frequency: editRecFrequency,
        is_active: Boolean(editingRec.is_active),
        next_run_date: editRecStart || String(editingRec.next_run_date).slice(0, 10),
        end_date: editRecEnd || null,
        account_id: acc ? acc.id : editingRec.account_id,
        category_id: cat ? cat.id : (editRecCategory ? editingRec.category_id : null),
      })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Jadwal gagal diperbarui", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingRec(null);
    pushToast("success", "Jadwal diperbarui", `${title} • ${rupiah(amount)}`);
    await loadData();
  }

  function openSplitModal() {
    setSplitTitle("");
    setSplitTotalDisplay("");
    setSplitAccount(accounts[0]?.name ?? "");
    setSplitDate(new Date().toISOString().slice(0, 10));
    setSplitNames("");
    setSplitModal(true);
  }

  function closeSplitModal() {
    setSplitModal(false);
  }

  function splitPreview(): { names: string[]; each: number[] } {
    const names = splitNames.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    const total = parseRibuan(splitTotalDisplay);
    if (names.length === 0 || !total || total < 1) return { names, each: [] };
    const n = names.length + 1;
    const each = Math.floor(total / n);
    return { names, each: names.map((_, i) => (i === names.length - 1 ? total - each * names.length : each)) };
  }

  async function submitSplit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const title = splitTitle.trim();
    const total = parseRibuan(splitTotalDisplay);
    const { names } = splitPreview();
    if (!title) {
      pushToast("error", "Judul belum diisi", "Contoh: Makan bareng, Villa Puncak.");
      return;
    }
    if (!total || total < 1) {
      pushToast("error", "Total belum valid", "Total harus lebih dari Rp 0.");
      return;
    }
    if (names.length === 0) {
      pushToast("error", "Teman belum diisi", "Pisahkan nama dengan koma. Bagianmu dihitung otomatis.");
      return;
    }
    const acc = splitAccount ? accounts.find(a => a.name === splitAccount) : null;
    const payload = {
      title, total_amount: total,
      members: names.map(n => ({ name: n })),
      account_id: acc?.id ?? null,
      split_date: splitDate || new Date().toISOString().slice(0, 10)
    };
    const response = await fetch("/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Patungan gagal dibuat", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setSplitTitle("");
    setSplitTotalDisplay("");
    setSplitNames("");
    pushToast("success", "Patungan dibuat", `${title} • ${names.length} teman`);
    await loadData();
  }

  function deleteSplit(s: Split) {
    setConfirm({
      title: "Hapus patungan?",
      message: `Hapus "${s.title}" beserta catatan siapa sudah bayar? Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/splits?id=${s.id}`, { method: "DELETE" });
        pushToast("success", "Patungan dihapus");
        await loadData();
      }
    });
  }

  function openEditSplit(s: Split) {
    setEditingSplit(s);
    setEditSplitTitle(s.title);
    setEditSplitTotalDisplay(new Intl.NumberFormat("id-ID").format(Number(s.total_amount)));
    setEditSplitAccount(s.account ?? "");
    setEditSplitDate(String(s.split_date).slice(0, 10));
    setEditSplitNote(s.note ?? "");
    setEditSplitNames(s.members.map(m => m.name).join(", "));
  }

  async function submitEditSplit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingSplit) return;
    const title = editSplitTitle.trim();
    const total = parseRibuan(editSplitTotalDisplay);
    const names = editSplitNames.split(/[,;\n]+/).map(n => n.trim()).filter(Boolean).slice(0, 20);
    if (!title) {
      pushToast("error", "Judul belum diisi", "Contoh: Makan bareng.");
      return;
    }
    if (!total || total < 1) {
      pushToast("error", "Total belum valid", "Total harus lebih dari Rp 0.");
      return;
    }
    if (names.length === 0) {
      pushToast("error", "Teman belum diisi", "Pisahkan nama dengan koma.");
      return;
    }
    const acc = editSplitAccount ? accounts.find(a => a.name === editSplitAccount) : null;
    const response = await fetch("/api/splits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingSplit.id, title, total_amount: total,
        split_date: editSplitDate || String(editingSplit.split_date).slice(0, 10),
        note: editSplitNote.trim() || null,
        account_id: acc ? acc.id : null,
        members: names.map(n => ({ name: n })),
      })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Patungan gagal diperbarui", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingSplit(null);
    pushToast("success", "Patungan diperbarui", `${title} • ${rupiah(total)}`);
    await loadData();
  }

  function openEditDebt(d: Debt) {
    setEditingDebt(d);
    setEditDebtPerson(d.person);
    setEditDebtKind(d.kind);
    setEditDebtAmountDisplay(new Intl.NumberFormat("id-ID").format(Number(d.amount)));
    setEditDebtTimes(d.installments && d.installments > 0 ? String(d.installments) : "");
    setEditDebtDue(d.due_date ? String(d.due_date).slice(0, 10) : "");
    setEditDebtNote(d.note ?? "");
  }

  async function submitEditDebt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingDebt) return;
    const person = editDebtPerson.trim();
    const amount = parseRibuan(editDebtAmountDisplay);
    if (!person) {
      pushToast("error", "Nama belum diisi", "Contoh: Budi.");
      return;
    }
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    if (amount < Number(editingDebt.paid)) {
      pushToast("error", "Nominal terlalu kecil", `Sudah terbayar ${rupiah(Number(editingDebt.paid))}; nominal minimal sebesar itu.`);
      return;
    }
    const editTimesN = parseInt(editDebtTimes, 10);
    const response = await fetch("/api/debts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingDebt.id, person, kind: editDebtKind, amount,
        due_date: editDebtDue || null, note: editDebtNote.trim() || null,
        installments: editTimesN > 0 ? editTimesN : null,
      })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal diperbarui", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingDebt(null);
    setEditDebtTimes("");
    pushToast("success", "Data diperbarui", `${person} • ${rupiah(amount)}${editTimesN > 0 ? ` • ${editTimesN}×` : ""}`);
    await loadData();
  }

  function openPayModal(split: Split, member: SplitMember) {
    setPayModal({ split, member });
    const rest = Number(member.share_amount) - Number(member.paid_amount);
    setPayAmountDisplay(rest > 0 ? new Intl.NumberFormat("id-ID").format(Math.round(rest)) : "");
  }

  function closePayModal() {
    setPayModal(null);
    setPayAmountDisplay("");
  }

  async function submitPay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payModal) return;
    const amount = parseRibuan(payAmountDisplay);
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    const { split, member } = payModal;
    const rest = Number(member.share_amount) - Number(member.paid_amount);
    if (amount > rest) {
      pushToast("error", "Melebihi tagihan", `Sisa ${member.name} tinggal ${rupiah(rest)}.`);
      return;
    }
    const response = await fetch("/api/splits/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id, amount })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal mencatat", result.error ?? "Coba lagi sebentar.");
      return;
    }
    closePayModal();
    pushToast("success", "Pembayaran dicatat", `${member.name} • ${rupiah(amount)}`);
    await loadData();
  }

  function handleInsightAction(action?: string, target?: string) {
    if (action === "DETAIL_SKOR" || action === "ATUR_REM") {
      const d = new Date();
      setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      setReportModal(true);
    } else if (action === "BUKA_LAPORAN" && target) {
      setReportMonth(target);
      setReportModal(true);
    } else if (action === "BUAT_ANGGARAN" || action === "KURANGI") {
      openBudgetModal();
    } else if (action === "LIHAT_HARI" && target) {
      setDateFrom(target);
      setDateTo(target);
      setFilter("expense");
      setPage(1);
      scrollToSection("transaksi");
    } else if (action === "NABUNG" && target) {
      const g = goals.find(x => x.name === target);
      if (g) void openAllocModal(g);
    } else if (action === "LIHAT_UTANG") {
      setDebtOpen(true);
      scrollToSection("utang");
    }
  }

  const insightCta = (action?: string) =>
    action === "DETAIL_SKOR" || action === "ATUR_REM" ? "Lihat laporan"
    : action === "BUAT_ANGGARAN" || action === "KURANGI" ? "Atur anggaran"
    : action === "LIHAT_HARI" ? "Lihat transaksi"
    : action === "NABUNG" ? "Nabung sekarang" : null;

  function openGoalModal() {
    setGoalName("");
    setGoalTargetDisplay("");
    setGoalDeadline("");
    setGoalModal(true);
  }

  function closeGoalModal() {
    setGoalModal(false);
  }

  async function submitGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = goalName.trim();
    const target = parseRibuan(goalTargetDisplay);
    if (!name) {
      pushToast("error", "Nama belum diisi", "Contoh: Dana darurat.");
      return;
    }
    if (!target || target < 1) {
      pushToast("error", "Target belum valid", "Target harus lebih dari Rp 0.");
      return;
    }
    const formEl = e.currentTarget;
    const payload = { name, target_amount: target, deadline: goalDeadline || null };
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Target gagal dibuat", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setGoalName("");
    setGoalTargetDisplay("");
    setGoalDeadline("");
    pushToast("success", "Target dibuat", `${name} • ${rupiah(target)}`);
    await loadData();
  }

  function deleteGoal(id: string, name: string) {
    setConfirm({
      title: "Hapus target?",
      message: `Target "${name}" beserta riwayat alokasinya akan diarsipkan. Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
        pushToast("success", "Target dihapus");
        await loadData();
      }
    });
  }

  async function openAllocModal(g: Goal) {
    setAllocModal(g);
    setAllocDirection("deposit");
    setAllocAccount(accounts[0]?.name ?? "");
    setAllocAmountDisplay("");
    setAllocNote("");
    try {
      const res = await fetch(`/api/goals/allocations?goal_id=${g.id}`);
      const rows = await res.json();
      setAllocHistory(Array.isArray(rows) ? rows : []);
    } catch {
      setAllocHistory([]);
    }
  }

  function closeAllocModal() {
    setAllocModal(null);
    setAllocHistory([]);
  }

  async function submitAllocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!allocModal) return;
    const amount = parseRibuan(allocAmountDisplay);
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    const acc = allocAccount ? accounts.find(a => a.name === allocAccount) : null;
    const isDeposit = allocDirection === "deposit";
    const formEl = e.currentTarget;
    const goalName = allocModal.name;
    const goalId = allocModal.id;
    const response = await fetch("/api/goals/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: goalId, direction: allocDirection,
        account_id: acc?.id ?? null, amount, note: allocNote.trim() || null
      })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Alokasi gagal", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setAllocAmountDisplay("");
    setAllocNote("");
    pushToast("success", isDeposit ? "Dana ditambahkan" : "Dana ditarik", `${goalName} • ${rupiah(amount)}`);
    await loadData();
    try {
      const res = await fetch(`/api/goals/allocations?goal_id=${goalId}`);
      const rows = await res.json();
      setAllocHistory(Array.isArray(rows) ? rows : []);
      const gRes = await fetch("/api/goals");
      const gls = await gRes.json();
      if (Array.isArray(gls)) {
        const fresh = gls.find((x: Goal) => x.id === goalId);
        if (fresh) setAllocModal(fresh);
      }
    } catch {
      setAllocModal(null);
    }
  }

  function openTransferModal() {
    setEditingTransfer(null);
    setTransferFrom(accounts[0]?.name ?? "");
    setTransferTo(accounts[1]?.name ?? accounts[0]?.name ?? "");
    setTransferAmountDisplay("");
    setTransferNote("");
    setTransferDate(todayStr());
    setTransferModal(true);
  }

  function closeTransferModal() {
    setTransferModal(false);
    setEditingTransfer(null);
  }

  async function submitTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const from = accounts.find(a => a.name === transferFrom);
    const to = accounts.find(a => a.name === transferTo);
    if (!from || !to) {
      pushToast("error", "Akun belum lengkap", "Pilih akun asal dan tujuan dulu.");
      return;
    }
    if (from.id === to.id) {
      pushToast("error", "Akun harus berbeda", "Akun asal dan tujuan tidak boleh sama.");
      return;
    }
    const amount = parseRibuan(transferAmountDisplay);
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal transfer harus lebih dari Rp 0.");
      return;
    }
    if (Number(from.current_balance) < amount) {
      pushToast("error", "Saldo tidak cukup", `Saldo ${from.name} ${rupiah(Number(from.current_balance))}, butuh ${rupiah(amount)}.`);
      return;
    }
    const note = transferNote.trim() || `Transfer ${from.name} → ${to.name}`;
    const formEl = e.currentTarget;
    if (editingTransfer?.groupId) {
      const response = await fetch("/api/transfers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_group_id: editingTransfer.groupId, from_account_id: from.id, to_account_id: to.id, amount, note, transaction_date: transferDate || todayStr() })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        pushToast("error", "Transfer gagal diperbarui", result.error ?? "Coba lagi sebentar.");
        return;
      }
      setEditingTransfer(null);
      setTransferModal(false);
      pushToast("success", "Transfer diperbarui", `${from.name} → ${to.name} • ${rupiah(amount)}`);
      await loadData();
      return;
    }
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_account_id: from.id, to_account_id: to.id, amount, note, transaction_date: transferDate || todayStr() })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Transfer gagal", result.error ?? "Coba lagi sebentar.");
      return;
    }
    formEl.reset();
    setTransferAmountDisplay("");
    setTransferNote("");
    setTransferDate(todayStr());
    pushToast("success", "Transfer berhasil", `${from.name} → ${to.name} • ${rupiah(amount)}`);
    await loadData();
  }

  function deleteTransaction(id: string, title?: string) {
    setConfirm({
      title: "Hapus transaksi?",
      message: title ? `Transaksi "${title}" akan dihapus permanen dan saldo ikut disesuaikan. Lanjutkan?` : "Transaksi ini akan dihapus permanen dan saldo ikut disesuaikan. Lanjutkan?",
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
        pushToast("success", "Transaksi dihapus");
        await loadData();
      }
    });
  }

  function transferLegs(t: Transaction): { out: Transaction; inn?: Transaction } {
    if (t.type === "transfer_out") {
      const inn = transactions.find(x => x.transfer_group_id && x.transfer_group_id === t.transfer_group_id && x.type === "transfer_in");
      return { out: t, inn };
    }
    const out = transactions.find(x => x.transfer_group_id && x.transfer_group_id === t.transfer_group_id && x.type === "transfer_out") ?? t;
    const inn = t.type === "transfer_in" ? t : transactions.find(x => x.transfer_group_id && x.transfer_group_id === t.transfer_group_id && x.type === "transfer_in");
    return { out, inn };
  }

  function openEditTransfer(t: Transaction) {
    const { out, inn } = transferLegs(t);
    const outAcc = accounts.find(a => a.id === out.account_id)?.name ?? out.account ?? accounts[0]?.name ?? "";
    const inAcc = (inn ? accounts.find(a => a.id === inn.account_id)?.name ?? inn.account : null) ?? accounts[1]?.name ?? accounts[0]?.name ?? "";
    setTransferFrom(outAcc);
    setTransferTo(inAcc);
    setTransferAmountDisplay(new Intl.NumberFormat("id-ID").format(Number(out.amount)));
    setTransferDate(String(out.transaction_date).slice(0, 10));
    setTransferNote(String(out.note || t.title || "").replace(/^Transfer .* → .*$/, "").trim() || "");
    setEditingTransfer({
      groupId: String(out.transfer_group_id || ""),
      title: String(t.title || "Transfer"),
      amount: Number(out.amount),
      date: String(out.transaction_date).slice(0, 10),
      note: String(out.note || ""),
      outAccountId: String(out.account_id || ""),
      inAccountId: String((inn?.account_id) || ""),
      outTxId: String(out.id),
    });
    setTransferModal(true);
  }

  function deleteTransfer(t: Transaction) {
    const { out } = transferLegs(t);
    const groupId = out.transfer_group_id;
    if (!groupId) {
      deleteTransaction(t.id, t.title);
      return;
    }
    setConfirm({
      title: "Hapus transfer?",
      message: `Transfer "${t.title || "antar akun"}" sebesar ${rupiah(Number(out.amount))} akan dihapus dari kedua akun. Saldo ikut disesuaikan. Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        const response = await fetch(`/api/transfers?group_id=${groupId}`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          pushToast("error", "Transfer gagal dihapus", result.error ?? "Coba lagi sebentar.");
          return;
        }
        pushToast("success", "Transfer dihapus");
        await loadData();
      }
    });
  }

  function openEditBudget(b: Budget) {
    setEditingBudget(b);
    setEditBudgetDisplay(new Intl.NumberFormat("id-ID").format(Number(b.budget)));
  }

  async function submitEditBudget(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingBudget) return;
    const amount = parseRibuan(editBudgetDisplay);
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal anggaran harus lebih dari Rp 0.");
      return;
    }
    const response = await fetch("/api/budgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingBudget.id, amount })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Anggaran gagal diperbarui", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingBudget(null);
    pushToast("success", "Anggaran diperbarui", `${editingBudget.category} • ${rupiah(amount)}/bulan`);
    await loadData();
  }

  function openEditGoal(g: Goal) {
    setEditingGoal(g);
    setEditGoalName(g.name);
    setEditGoalTargetDisplay(new Intl.NumberFormat("id-ID").format(Number(g.target_amount)));
    setEditGoalDeadline(g.deadline ? String(g.deadline).slice(0, 10) : "");
  }

  const GUIDE_STEPS: GuideStep[] = [
    { title: "1. Catat transaksi", body: "Klik Catat transaksi, pilih Pemasukan atau Pengeluaran, isi nama, kategori, akun, nominal, dan tanggal. Tanpa dialog konfirmasi — langsung tersimpan." },
    { title: "2. Kelola akun", body: "Tambah akun bank/e-wallet/tunai di Akun saya. Klik ✎ untuk ubah nama atau koreksi saldo awal, × untuk hapus. Akun yang sudah dipakai transaksi akan diarsipkan." },
    { title: "3. Transfer antar akun", body: "Klik Transfer untuk pindah saldo. Transfer tercatat sebagai pasangan keluar-masuk; klik ✎ di daftar untuk ubah, × untuk hapus keduanya sekaligus." },
    { title: "4. Anggaran bulanan", body: "Batasi belanja per kategori. Bagian Anggaran default tertutup — klik Lihat semua untuk expand. Klik ✎ untuk ubah nominal tanpa buat baru." },
    { title: "5. Target & utang", body: "Buat target tabungan lalu Kelola dana untuk nabung/tarik. Catat utang (kamu berutang) dan piutang (orang berutang padamu), cicil lewat tombol Bayar sampai lunas." },
    { title: "6. Otomatisasi", body: "Jadwal rutin membuat transaksi otomatis tiap hari/minggu/bulan. Patungan membagi tagihan ke teman. Laporan bulanan bisa dicetak atau dibagikan." },
  ];

  function openDebtModal(kind: "debt" | "receivable" = "debt") {
    setDebtKind(kind);
    setDebtPerson("");
    setDebtAmountDisplay("");
    setDebtTimes("");
    setDebtDue("");
    setDebtNote("");
    setDebtModal(true);
  }

  async function submitDebt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = parseRibuan(debtAmountDisplay);
    if (!debtPerson.trim()) {
      pushToast("error", "Nama belum diisi", "Contoh: Budi, Toko kelontong.");
      return;
    }
    if (!amount || amount < 1) {
      pushToast("error", "Nominal belum valid", "Nominal harus lebih dari Rp 0.");
      return;
    }
    const timesN = parseInt(debtTimes, 10);
    const response = await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: debtKind, person: debtPerson.trim(), amount, due_date: debtDue || null, note: debtNote.trim() || null, installments: timesN > 0 ? timesN : null })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal menyimpan", result.error ?? "Coba lagi sebentar.");
      return;
    }
    const perText = timesN > 0 ? ` • ${timesN}× @ ${rupiah(Math.max(1, Math.round(amount / timesN)))}` : "";
    setDebtModal(false);
    setDebtTimes("");
    pushToast("success", debtKind === "debt" ? "Utang dicatat" : "Piutang dicatat", `${debtPerson.trim()} • ${rupiah(amount)}${perText}`);
    await loadData();
  }

  async function payDebt(d: Debt, amount?: number) {
    const pay = amount ?? Number(d.remaining);
    if (!pay || pay < 1) return;
    if (pay > Math.max(0, Number(d.remaining ?? (Number(d.amount) - Number(d.paid))))) {
      pushToast("error", "Melebihi sisa", `Sisa ${d.person} tinggal ${rupiah(Number(d.remaining))}.`);
      return;
    }
    const response = await fetch("/api/debts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, pay })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal mencatat bayar", result.error ?? "Coba lagi sebentar.");
      return;
    }
    const result = await response.json().catch(() => ({}));
    pushToast("success", result.settled ? "Lunas!" : "Cicilan dicatat", `${d.person} • ${rupiah(pay)}`);
    await loadData();
  }

  function payRestOf(d: Debt): number {
    return Math.max(0, Number(d.remaining ?? (Number(d.amount) - Number(d.paid))));
  }

  // Info cicilan: ke berapa berikutnya, dari total berapa, nominalnya berapa.
  function debtInstallmentInfo(d: Debt): { done: number; total: number; nextNo: number; nextAmount: number; rest: number } {
    const total = Number(d.amount) || 0;
    const rest = payRestOf(d);
    const plan = Number(d.installments ?? 0);
    const done = Math.max(0, Number(d.installments_paid ?? 0));
    if (!(plan > 0) || rest <= 0) return { done, total: plan, nextNo: done + 1, nextAmount: rest, rest };
    const remainingCount = Math.max(1, plan - done);
    // Nominal cicilan ini = sisa / sisa cicilan (cicilan terakhir = sisa penuh).
    const nextAmount = remainingCount <= 1 ? rest : Math.min(rest, Math.max(1, Math.round(total / plan)));
    return { done, total: plan, nextNo: Math.min(plan, done + 1), nextAmount, rest };
  }

  async function payOneInstallment(d: Debt, opts?: { accountId?: string; category?: string }) {
    const rest = payRestOf(d);
    if (rest <= 0) return;
    const info = debtInstallmentInfo(d);
    const accountId = opts?.accountId || "";
    if (!accountId) {
      pushToast("error", "Akun belum dipilih", "Pilih akun pembayaran dulu.");
      return;
    }
    const response = await fetch("/api/debts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, pay_installment: true, account_id: accountId, category: opts?.category || undefined })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal mencatat bayar", result.error ?? "Coba lagi sebentar.");
      return;
    }
    const result = await response.json().catch(() => ({})) as { settled?: boolean; installment_no?: number; installment_total?: number | null; installment_amount?: number };
    const paidAmt = Number(result.installment_amount ?? info.nextAmount);
    if (result.settled) {
      pushToast("success", "Lunas!", `${d.person} • ${rupiah(paidAmt)}${info.total > 0 ? ` (cicilan ${info.total}/${info.total})` : ""}`);
    } else if (info.total > 0) {
      pushToast("success", `Cicilan ${result.installment_no ?? info.nextNo}/${info.total} dibayar`, `${d.person} • ${rupiah(paidAmt)}`);
    } else {
      pushToast("success", "Cicilan dicatat", `${d.person} • ${rupiah(paidAmt)}`);
    }
    await loadData();
  }

  function payDefaultCategory(d: Debt): string {
    const txType = d.kind === "debt" ? "expense" : "income";
    const def = d.kind === "debt" ? "Utang" : "Piutang";
    const has = categories.some(c => c.name === def && c.type === txType);
    if (has) return def;
    return categories.find(c => c.type === txType)?.name ?? "";
  }

  function openPayDebt(d: Debt) {
    setPayingDebt(d);
    setPayDebtCategory(payDefaultCategory(d));
    setPayDebtAccount(accounts[0]?.name ?? "");
  }

  async function submitPayDebt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payingDebt) return;
    // Satu tombol Bayar = bayar 1 cicilan otomatis sesuai rencana.
    // Nominal dihitung backend (pay_installment) agar konsisten dengan
    // info "cicilan ke-X dari N" yang tampil di kartu & modal.
    // Transaksi ikut tercatat agar saldo akun + aktivitas terbaru berubah.
    const rest = payRestOf(payingDebt);
    if (rest <= 0) {
      pushToast("error", "Sudah lunas", `${payingDebt.person} tidak punya sisa.`);
      setPayingDebt(null);
      return;
    }
    const acc = accounts.find(a => a.name === payDebtAccount);
    if (!acc) {
      pushToast("error", "Akun belum dipilih", "Pilih akun pembayaran dulu.");
      return;
    }
    await payOneInstallment(payingDebt, { accountId: acc.id, category: payDebtCategory || undefined });
    setPayingDebt(null);
  }

  async function reopenDebt(d: Debt) {
    const response = await fetch("/api/debts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, reopen: true })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Gagal mengembalikan", result.error ?? "Coba lagi sebentar.");
      return;
    }
    pushToast("success", "Dikembalikan ke belum lunas", d.person);
    await loadData();
  }

  function deleteDebtHistory(d: Debt) {
    setConfirm({
      title: "Hapus riwayat?",
      message: `Hapus riwayat lunas "${d.person}" • ${rupiah(Number(d.amount))} permanen? Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/debts?id=${d.id}`, { method: "DELETE" });
        pushToast("success", "Riwayat dihapus");
        await loadData();
      }
    });
  }

  function deleteDebt(d: Debt) {
    setConfirm({
      title: d.kind === "debt" ? "Hapus utang?" : "Hapus piutang?",
      message: `"${d.person}" • sisa ${rupiah(Number(d.remaining))} akan dihapus dari daftar. Lanjutkan?`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/debts?id=${d.id}`, { method: "DELETE" });
        pushToast("success", "Data dihapus");
        await loadData();
      }
    });
  }

  async function submitEditGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingGoal) return;
    const name = editGoalName.trim();
    const target = parseRibuan(editGoalTargetDisplay);
    if (!name) {
      pushToast("error", "Nama belum diisi", "Contoh: Dana darurat.");
      return;
    }
    if (!target || target < 1) {
      pushToast("error", "Target belum valid", "Target harus lebih dari Rp 0.");
      return;
    }
    const response = await fetch("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingGoal.id, name, target_amount: target, deadline: editGoalDeadline || null })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      pushToast("error", "Target gagal diperbarui", result.error ?? "Coba lagi sebentar.");
      return;
    }
    setEditingGoal(null);
    pushToast("success", "Target diperbarui", `${name} • ${rupiah(target)}`);
    await loadData();
  }

  async function openReceipt(tx: Transaction) {
    setReceiptTx(tx);
    setReceiptView(null);
    if (!tx.has_receipt) return;
    try {
      const res = await fetch(`/api/transactions/${tx.id}/receipt`);
      const data = await res.json();
      if (res.ok) setReceiptView(data);
    } catch { /* abaikan */ }
  }

  function closeReceipt() {
    setReceiptTx(null);
    setReceiptView(null);
  }

  function uploadReceipt(file: File | undefined) {
    if (!file || !receiptTx) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      pushToast("error", "Format tidak didukung", "Pakai JPG, PNG, WebP, atau PDF.");
      return;
    }
    if (file.size > 1_500_000) {
      pushToast("error", "File terlalu besar", "Maksimal ±1,5MB.");
      return;
    }
    setReceiptBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        const response = await fetch(`/api/transactions/${receiptTx.id}/receipt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: base64, mime: file.type, name: file.name })
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          pushToast("error", "Struk gagal diunggah", result.error ?? "Coba lagi.");
          return;
        }
        pushToast("success", "Struk tersimpan", file.name);
        setReceiptView({ mime: file.type, name: file.name, data: base64 });
        await loadData();
      } finally {
        setReceiptBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function deleteReceipt() {
    if (!receiptTx) return;
    const tx = receiptTx;
    setConfirm({
      title: "Hapus struk?",
      message: `Lampiran "${tx.receipt_name || "struk"}" akan dihapus. Transaksinya tetap ada.`,
      confirmLabel: "Ya, hapus",
      danger: true,
      onConfirm: async () => {
        await fetch(`/api/transactions/${tx.id}/receipt`, { method: "DELETE" });
        setReceiptView(null);
        pushToast("success", "Struk dihapus");
        await loadData();
      }
    });
  }

  function openImportModal() {
    setImportRows([]);
    setImportErrors([]);
    setImportFileName("");
    setImportModal(true);
  }

  function downloadImportTemplate() {
    const lines = [
      "judul;tipe;kategori;akun;nominal;tanggal",
      "Gaji September;income;Pemasukan;yovie1;10000000;2026-09-01",
      "Makan siang;expense;Makan & Minum;yovie1;50000;2026-09-02"
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-impor-ruang-saku.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseImportFile(file: File | undefined) {
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "").replace(/^\uFEFF/, "");
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setImportErrors(["File kosong atau hanya berisi header."]);
          setImportRows([]);
          return;
        }
        const splitCsv = (line: string) => {
          const sep = line.includes(";") ? ";" : ",";
          const out: string[] = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
              else inQ = !inQ;
            } else if (ch === sep && !inQ) { out.push(cur); cur = ""; }
            else cur += ch;
          }
          out.push(cur);
          return out.map(s => s.trim().replace(/^"|"$/g, ""));
        };
        const header = splitCsv(lines[0]).map(h => h.toLowerCase());
        const idx = (names: string[]) => header.findIndex(h => names.includes(h));
        const iTitle = idx(["judul", "title", "nama", "keterangan"]);
        const iType = idx(["tipe", "type", "jenis"]);
        const iCat = idx(["kategori", "category"]);
        const iAcc = idx(["akun", "account"]);
        const iAmt = idx(["nominal", "amount", "jumlah"]);
        const iDate = idx(["tanggal", "date"]);
        if (iTitle < 0 || iType < 0 || iAcc < 0 || iAmt < 0 || iDate < 0) {
          setImportErrors(["Header wajib: judul;tipe;kategori;akun;nominal;tanggal. Unduh template dulu."]);
          setImportRows([]);
          return;
        }
        const rows: { title: string; type: string; category: string; account: string; amount: number; date: string }[] = [];
        const errs: string[] = [];
        const normType = (v: string) => {
          const s = v.toLowerCase();
          if (["income", "pemasukan", "masuk", "in"].includes(s)) return "income";
          if (["expense", "pengeluaran", "keluar", "out"].includes(s)) return "expense";
          return s;
        };
        const normDate = (v: string) => {
          const s = v.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
          if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
          return s;
        };
        for (let i = 1; i < lines.length && i <= 201; i++) {
          const c = splitCsv(lines[i]);
          const amount = Number(String(c[iAmt] || "").replace(/\./g, "").replace(/[^0-9]/g, ""));
          rows.push({
            title: c[iTitle] || "",
            type: normType(c[iType] || ""),
            category: iCat >= 0 ? (c[iCat] || "") : "",
            account: c[iAcc] || "",
            amount,
            date: normDate(c[iDate] || "")
          });
        }
        setImportRows(rows);
        setImportErrors(errs);
        if (rows.length > 0) pushToast("success", "File terbaca", `${rows.length} baris siap diimpor.`);
      } catch {
        setImportErrors(["Gagal membaca file. Pastikan format CSV."]);
        setImportRows([]);
      }
    };
    reader.readAsText(file);
  }

  async function submitImport() {
    if (importRows.length === 0) {
      pushToast("error", "Belum ada data", "Pilih file CSV dulu.");
      return;
    }
    setImportBusy(true);
    try {
      const response = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        pushToast("error", "Impor gagal", result.error ?? "Coba lagi.");
        return;
      }
      setImportErrors(Array.isArray(result.errors) ? result.errors : []);
      if (Number(result.created) > 0) {
        pushToast("success", "Impor selesai", `${result.created} transaksi masuk${Number(result.failed) > 0 ? `, ${result.failed} gagal` : ""}.`);
        await loadData();
      } else {
        pushToast("error", "Tidak ada yang masuk", "Periksa pesan error per baris.");
      }
      if (Number(result.created) > 0 && Number(result.failed) === 0) {
        setImportModal(false);
        setImportRows([]);
        setImportFileName("");
      }
    } finally {
      setImportBusy(false);
    }
  }

  if (loading) return <main className="auth-page"><p style={{margin:"auto",color:"#83908e"}}>Memuat data keuangan…</p></main>;

  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return <main>
    {menu && <div className="sidebar-backdrop" onClick={() => setMenu(false)} />}
    <aside className={menu ? "sidebar open" : "sidebar"}>
      <div className="brand"><img className="brand-mark-img" src="/logo.svg" alt="Ruang Saku" width={34} height={34} /><span>ruang<span>saku</span></span></div>
      <nav>
        <a className={activeNav === "beranda" ? "active" : ""} href="#beranda" onClick={e => { e.preventDefault(); scrollToSection("beranda"); }}><span>⌂</span> Beranda</a>
        <a className={activeNav === "transaksi" ? "active" : ""} href="#transaksi" onClick={e => { e.preventDefault(); scrollToSection("transaksi"); }}><span>⇄</span> Transaksi</a>
        <a className={activeNav === "akun" ? "active" : ""} href="#akun" onClick={e => { e.preventDefault(); scrollToSection("akun"); }}><span>▣</span> Akun</a>
      </nav>
      <div className="sidebar-bottom">
        {session?.user?.role === "admin" && <a href="/admin"><span>♙</span> Panel Admin</a>}
        <div className="help-card"><b>Butuh bantuan?</b><p>Lihat panduan untuk mengatur keuanganmu.</p><button onClick={() => setGuideModal(true)}>Pelajari</button></div>
        <div className="sidebar-toggles">
          <InstallButton className="sidebar-toggle" />
          <ThemeToggle className="sidebar-toggle" />
        </div>
        <div className="profile">
          <div className="avatar">{session?.user?.name?.slice(0, 2).toUpperCase() ?? "U"}</div>
          <div className="profile-info"><b>{session?.user?.name ?? "Pengguna"}</b><small>{session?.user?.role === "admin" ? "Administrator" : "Personal"}</small></div>
          <button type="button" className="logout-btn" onClick={() => signOut({ callbackUrl: "/login" })} title="Keluar dari akun">⏻ <span>Keluar</span></button>
        </div>
      </div>
    </aside>
    <section className="workspace" id="beranda">
      <header>
        <button className="mobile-menu" onClick={() => setMenu(!menu)}>☰</button>
        <div>
          <p className="eyebrow">{today.toUpperCase()}</p>
          <h1>Selamat datang, {session?.user?.name?.split(" ")[0] ?? ""} <span>👋</span></h1>
        </div>
        <div className="header-actions">
          <button type="button" className="theme-toggle notif-bell" onClick={() => { setNotifOpen(o => !o); }} title="Notifikasi">
            🔔{unreadCount > 0 && <i className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</i>}
          </button>
          <InstallButton />
          <ThemeToggle />
          <button type="button" className="theme-toggle" onClick={togglePrivacy} title={privacyHide ? "Tampilkan nominal" : "Sembunyikan nominal"}>{privacyHide ? "👁‍🗨" : "👁"}</button>
          <button type="button" className="theme-toggle" onClick={() => { setPinInput(""); setPinModal(hasPin ? "unlock" : "set"); }} title={hasPin ? "Kunci / buka aplikasi" : "Aktifkan PIN"}>{locked ? "🔒" : "🔓"}</button>
          <button className="transfer-button" onClick={openTransferModal} title="Pindah saldo antar akun">⇄ Transfer</button>
          <button className="transfer-button" onClick={() => setReportModal(true)} title="Lihat laporan bulanan">▤ Laporan</button>
          <button className="add-button" onClick={openTransactionDialog}><strong>＋</strong> Catat transaksi</button>
        </div>
      </header>
      {notifOpen && <section className="notif-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="notif-head">
          <div><b>Notifikasi</b><small>{unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</small></div>
          <div className="notif-head-actions">
            {!pushOn && <button type="button" className="clear-filter" onClick={enablePush}>Aktifkan pengingat</button>}
            {notifItems.length > 0 && <button type="button" className="clear-filter" onClick={() => markNotifRead()}>Tandai dibaca</button>}
            <button type="button" className="close" style={{ position: "static" }} onClick={() => setNotifOpen(false)}>×</button>
          </div>
        </div>
        {notifItems.length === 0
          ? <p className="report-empty">Aman — tidak ada peringatan. Anggaran, jadwal, target, dan patungan terpantau.</p>
          : <div className="notif-list">
            {notifItems.map(n => {
              const read = readIds.includes(n.id);
              return <button key={n.id} type="button" className={"notif-item " + n.kind + (read ? " read" : "")} onClick={() => { markNotifRead(n.id); setNotifOpen(false); handleInsightAction(n.action, n.target); }}>
                <span className="insight-emoji">{n.kind === "error" ? "✕" : n.kind === "warning" ? "!" : n.kind === "success" ? "✓" : "i"}</span>
                <span className="notif-text"><b>{n.title}</b><small>{n.detail}</small></span>
              </button>;
            })}
          </div>}
      </section>}
      <div className="mobile-add"><button className="add-button" onClick={openTransactionDialog}>＋ Catat transaksi</button><button className="transfer-button" onClick={openTransferModal}>⇄ Transfer</button><button className="transfer-button" onClick={() => setReportModal(true)}>▤ Laporan</button></div>
      <section className="summary">
        <div className="balance-card">
          <div className="balance-top"><span>Saldo total (semua waktu)</span></div>
          <h2>{maskRp(total)}</h2>
          <div className="balance-footer"><small>Tersebar di {accounts.length} akun • termasuk saldo awal</small></div>
        </div>
        <div className="stat-card income">
          <div className="stat-icon">↙</div>
          <div><p>Pemasukan (semua waktu)</p><h3>{maskRp(income)}</h3></div>
        </div>
        <div className="stat-card expense">
          <div className="stat-icon">↗</div>
          <div><p>Pengeluaran (semua waktu)</p><h3>{maskRp(expense)}</h3></div>
        </div>
      </section>
      <section className="content-grid">
        <div className="main-column">
          <div className="insight-grid">
            <div className="insight-card">
              <div className="section-title">
                <div><h2>Arus 30 hari</h2><p>Pemasukan vs pengeluaran harian</p></div>
              </div>
              <div className="chart-legend"><span><i className="dot in" /> Pemasukan</span><span><i className="dot out" /> Pengeluaran</span></div>
              <div className="bar-chart">
                {trend30.map(d => <div key={d.key} className="bar-group" title={`${d.label}: +${rupiah(d.income)} / -${rupiah(d.expense)}`}>
                  <div className="bar-pair">
                    <span className="bar in" style={{ height: `${Math.max(3, (d.income / trendMax) * 110)}px`, opacity: d.income ? 1 : 0.18 }} />
                    <span className="bar out" style={{ height: `${Math.max(3, (d.expense / trendMax) * 110)}px`, opacity: d.expense ? 1 : 0.18 }} />
                  </div>
                </div>)}
              </div>
              <div className="bar-labels"><span>{trend30[0]?.label}</span><span>{trend30[trend30.length - 1]?.label}</span></div>
            </div>
            <div className="insight-card">
              <div className="section-title">
                <div><h2>Pengeluaran</h2><p>Berdasarkan kategori</p></div>
              </div>
              {expenseByCategory.length === 0 ? <p style={{ color: "#9aa5a2", fontSize: 13 }}>Belum ada pengeluaran tercatat.</p> : <>
                <div className="donut-wrap">
                  <div className="donut" style={{ background: donutBackground }}><div className="donut-center"><b>{maskRp(expense)}</b><small>total keluar</small></div></div>
                </div>
                <div className="category-legend">
                  {expenseByCategory.map(c => <div key={c.name} className="category-row">
                    <span><i className="dot" style={{ background: c.color }} /> {c.name}</span>
                    <span><b>{maskRp(c.value)}</b> <small>{c.pct.toFixed(0)}%</small></span>
                  </div>)}
                </div>
              </>}
            </div>
          </div>
          <div className="insight-card insight-wide">
            <div className="section-title">
              <div><h2>Kalender arus kas</h2><p>{calData.label} • masuk {maskRp(calData.mIn)} • keluar {maskRp(calData.mOut)}</p></div>
              <div className="cal-nav">
                <button type="button" className="clear-filter" onClick={() => shiftCalMonth(-1)}>←</button>
                <input type="month" value={calMonth} onChange={e => { if (e.target.value) { setCalMonth(e.target.value); setSelectedDay(""); } }} />
                <button type="button" className="clear-filter" onClick={() => shiftCalMonth(1)}>→</button>
              </div>
            </div>
            <div className="cal-grid cal-head"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div>
            <div className="cal-grid">
              {calData.cells.map((c, i) => {
                if (!c) return <span key={"e" + i} className="cal-cell empty" />;
                const e = calData.byDay.get(c.key);
                const lvl = !e || e.expense <= 0 ? (e && e.income > 0 ? "in" : "") : e.expense >= calData.maxOut * 0.75 ? "l4" : e.expense >= calData.maxOut * 0.5 ? "l3" : e.expense >= calData.maxOut * 0.25 ? "l2" : "l1";
                const isSel = selectedDay === c.key;
                const isToday = c.key === todayStr();
                return <button key={c.key} type="button" className={"cal-cell " + lvl + (isSel ? " sel" : "") + (isToday ? " today" : "")} onClick={() => setSelectedDay(c.key)} title={e ? `${c.key}: +${rupiah(e.income)} / -${rupiah(e.expense)} (${e.count} trx)` : c.key}>
                  <b>{c.day}</b>
                  {e && e.count > 0 && <small>{e.count} trx</small>}
                  {e && e.expense > 0 && <i className="cal-bar"><i style={{ width: `${Math.min(100, (e.expense / calData.maxOut) * 100)}%` }} /></i>}
                </button>;
              })}
            </div>
            {selectedDay && <div className="cal-detail">
              <div className="cal-detail-head">
                <b>{new Date(selectedDay + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</b>
                <span>{selectedDayTxs.length} transaksi • {maskRp(selectedDayTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0))} masuk • {maskRp(selectedDayTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0))} keluar</span>
              </div>
              {selectedDayTxs.length === 0
                ? <p className="report-empty">Tidak ada transaksi hari ini.</p>
                : <>{selectedDayTxs.slice(0, 5).map(t => <div key={t.id} className="category-row">
                  <span>{t.title || "Tanpa judul"} <small>• {t.category ?? "Lainnya"}</small></span>
                  <b className={t.type === "income" ? "income" : "expense"}>{t.type === "income" ? "+" : "-"}{maskRp(Number(t.amount))}</b>
                </div>)}
                <button type="button" className="goal-cta" onClick={() => showDay(selectedDay)}>Tampilkan di daftar transaksi</button></>}
            </div>}
          </div>
          <div className="section-title">
            <div><h2>Aktivitas terbaru</h2><p>Transaksi yang baru kamu lakukan</p></div>
            <div className="section-actions">
              <button type="button" className="export-button" onClick={openImportModal} title="Impor CSV mutasi">⭳ Impor</button>
              <button type="button" className="export-button" onClick={exportCsv} title="Unduh CSV">⭳ CSV</button>
            </div>
          </div>
          <div className="filters">
            <button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Semua</button>
            <button className={filter === "income" ? "selected" : ""} onClick={() => setFilter("income")}>Pemasukan</button>
            <button className={filter === "expense" ? "selected" : ""} onClick={() => setFilter("expense")}>Pengeluaran</button>
            <button className={filter === "transfer" ? "selected" : ""} onClick={() => setFilter("transfer")}>Transfer</button>
          </div>
          <div className="search-row">
            <label className="search-box"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, kategori, akun, nominal…" /></label>
            <div className="date-filters">
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} title="Dari tanggal" />
              <span>–</span>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} title="Sampai tanggal" />
              {(search || dateFrom || dateTo) && <button type="button" className="clear-filter" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}>Reset</button>}
            </div>
          </div>
          <p className="result-count">{visible.length} dari {transactions.length} transaksi{(search || dateFrom || dateTo || filter !== "all") ? " (difilter)" : ""}</p>
          <div className="transaction-list" id="transaksi">
            {visible.length === 0 ? <p style={{color:"#9aa5a2",fontSize:13,padding:"30px 5px"}}>Tidak ada transaksi yang cocok. Ubah kata kunci atau rentang tanggal.</p> : paged.map(t => {
              const isTransfer = t.type === "transfer_in" || t.type === "transfer_out";
              const icon = t.type === "income" ? "↓" : t.type === "expense" ? "↑" : "⇄";
              const sign = t.type === "income" || t.type === "transfer_in" ? "+" : "-";
              // Transfer tampil sekali per grup (pakai kaki transfer_out sebagai representasi)
              if (isTransfer && t.type === "transfer_in" && t.transfer_group_id && transactions.some(x => x.transfer_group_id === t.transfer_group_id && x.type === "transfer_out")) return null;
              const pair = isTransfer && t.transfer_group_id
                ? transactions.find(x => x.transfer_group_id === t.transfer_group_id && x.id !== t.id)
                : null;
              return <article className="transaction" key={t.id}>
                <div className={"transaction-icon " + (isTransfer ? "transfer" : t.type)}>{icon}</div>
                <div className="transaction-info">
                  <b>{t.title || "Tanpa judul"}</b>
                  <p>{isTransfer ? `Transfer${pair ? ` • ${t.account ?? "—"} → ${pair.account ?? "—"}` : ""}` : (t.category ?? "Lainnya")} <i>•</i> {!isTransfer && <>{t.account ?? "—"}</>}{isTransfer && <>{formatDate(t.transaction_date)}</>}</p>
                </div>
                <div className="transaction-value">
                  <b className={t.type === "income" ? "income" : t.type === "expense" ? "expense" : "transfer"}>{sign}{maskRp(Number(t.amount))}</b>
                  <small>{formatDate(t.transaction_date)}</small>
                </div>
                <div className="tx-actions">
                  {isTransfer
                    ? <><button className="tx-edit" onClick={() => openEditTransfer(t)} title="Ubah transfer">✎</button>
                      <button className="tx-delete" onClick={() => deleteTransfer(t)} title="Hapus transfer">×</button></>
                    : <><button className="tx-edit" onClick={() => openEdit(t)} title="Ubah">✎</button>
                      <button className={"tx-edit" + (t.has_receipt ? " has-file" : "")} onClick={() => openReceipt(t)} title={t.has_receipt ? "Lihat struk" : "Lampirkan struk"}>{t.has_receipt ? "S*" : "S"}</button>
                      <button className="tx-delete" onClick={() => deleteTransaction(t.id, t.title)} title="Hapus">×</button></>}
                </div>
              </article>;
            })}
          </div>
          {totalPages > 1 && <div className="pagination">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Prev</button>
            <span>Halaman {safePage} / {totalPages}</span>
            <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next →</button>
          </div>}
        </div>
        <aside className="right-column">
          <div className="section-title">
            <div><h2>Akun saya</h2><p>{accounts.length} akun terhubung</p></div>
            <button className="round-add" onClick={openAccountModal}>＋</button>
          </div>
          <div className="accounts" id="akun">
            {accounts.length === 0 ? <p style={{color:"#9aa5a2",fontSize:12,padding:"12px 0"}}>Belum ada akun. Klik ＋ untuk menambah.</p> : accounts.map(a => (
              <div className="account" key={a.id}>
                <div className="bank-icon blue">{a.name.slice(0, 1).toUpperCase()}</div>
                <div><b>{a.name}</b><small>{a.account_number_last4 ? `•• ${a.account_number_last4}` : "Tanpa nomor"}</small></div>
                <strong>{maskRp(Number(a.current_balance))}</strong>
                <div className="tx-actions" style={{marginLeft:8}}>
                  <button className="tx-edit" onClick={() => openEditAccount(a)} title={`Ubah ${a.name}`}>✎</button>
                  <button className="tx-delete" onClick={() => deleteAccount(a)} title={`Hapus ${a.name}`}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="section-title" style={{ marginTop: 26 }}>
            <div><h2>Anggaran</h2><p>Batas belanja bulan ini • {budgetProgress.length} kategori</p></div>
            <div style={{display:"flex",gap:8}}>
              {budgetProgress.length > 2 && <button type="button" className="clear-filter" onClick={() => setBudgetOpen(v => !v)}>{budgetOpen ? "Tutup ▴" : `Lihat semua (${budgetProgress.length}) ▾`}</button>}
              <button className="round-add" onClick={openBudgetModal}>＋</button>
            </div>
          </div>
          <div className="budgets">
            {budgetProgress.length === 0
              ? <p style={{ color: "#9aa5a2", fontSize: 12, padding: "6px 0" }}>Belum ada anggaran. Klik ＋ untuk bikin batas per kategori.</p>
              : (budgetOpen ? budgetProgress : budgetProgress.slice(0, 2)).map(b => <div key={b.id} className={"budget-item " + b.status}>
                <div className="budget-head">
                  <b>{b.category}</b>
                  <div className="tx-actions">
                    <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => openEditBudget(b)} title="Ubah anggaran">✎</button>
                    <button type="button" className="budget-delete" onClick={() => deleteBudget(b.id, b.category)} title="Hapus anggaran">×</button>
                  </div>
                </div>
                <div className="budget-numbers"><span>{maskRp(b.spent)}</span><small>dari {maskRp(b.limit)} • {b.pct.toFixed(0)}%</small></div>
                <div className="budget-bar"><span style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                {b.status === "over"
                  ? <small className="budget-note over">Jebol {maskRp(b.spent - b.limit)} — kurangi belanja kategori ini.</small>
                  : b.status === "warn"
                    ? <small className="budget-note warn">Sisa {maskRp(Math.max(0, b.limit - b.spent))} — hampir habis.</small>
                    : <small className="budget-note safe">Sisa {maskRp(Math.max(0, b.limit - b.spent))} aman.</small>}
              </div>)}
          </div>
          {carrySuggestions.length > 0 && <div className="carry-box">
            <div className="carry-head">
              <div><b>Sisa bulan lalu bisa dialihkan</b><small>{carrySuggestions.length} kategori • jadi modal bulan ini</small></div>
              <button type="button" className="clear-filter primary" disabled={carryBusy} onClick={carryOverAll}>{carryBusy ? "…" : "Alihkan semua"}</button>
            </div>
            {carrySuggestions.slice(0, 4).map(s => <div key={s.category} className="category-row">
              <span>{s.category} <small>• sisa {maskRp(s.leftover)} dari {maskRp(s.limit)}</small></span>
              <button type="button" className="cat-save" disabled={carryBusy} onClick={() => carryOverBudget(s.category, s.leftover)}>Alihkan</button>
            </div>)}
          </div>}
          <div className="section-title" style={{ marginTop: 26 }}>
            <div><h2>Target tabungan</h2><p>Nabung bertahap sampai tercapai</p></div>
            <button className="round-add" onClick={openGoalModal}>＋</button>
          </div>
          <div className="goals">
            {goalProgress.length === 0
              ? <p style={{ color: "#9aa5a2", fontSize: 12, padding: "6px 0" }}>Belum ada target. Klik ＋ untuk bikin, misal Dana darurat Rp 10.000.000.</p>
              : goalProgress.map(g => <div key={g.id} className={"goal-item" + (g.done ? " done" : "")}>
                <div className="budget-head">
                  <b>{g.done ? "✓ " : ""}{g.name}</b>
                  <div className="tx-actions">
                    <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => openEditGoal(g)} title="Ubah target">✎</button>
                    <button type="button" className="budget-delete" onClick={() => deleteGoal(g.id, g.name)} title="Hapus target">×</button>
                  </div>
                </div>
                <div className="budget-numbers"><span>{maskRp(g.saved)}</span><small>dari {maskRp(g.target)} • {g.pct.toFixed(0)}%</small></div>
                <div className="budget-bar goal"><span style={{ width: `${Math.min(100, g.pct)}%` }} /></div>
                <small className={"budget-note " + (g.done ? "safe" : "")}>
                  {g.done
                    ? "Tercapai — selamat!"
                    : <>Kurang {maskRp(Math.max(0, g.target - g.saved))}{g.deadline ? ` • tenggat ${new Date(g.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}` : ""} • {g.deposits} kali nabung</>}
                </small>
                <button type="button" className="goal-cta" onClick={() => openAllocModal(g)}>Kelola dana</button>
              </div>)}
          </div>
          <div className="section-title" style={{ marginTop: 26 }}>
            <div><h2>Kategori</h2><p>Atur kategori & warna grafik</p></div>
            <button className="round-add" onClick={openCategoryModal}>＋</button>
          </div>
          <button type="button" className="goal-cta" onClick={openCategoryModal}>Kelola kategori ({categories.length})</button>
          <div className="section-title" style={{ marginTop: 26 }}>
            <div><h2>Jadwal rutin</h2><p>Gaji & langganan otomatis</p></div>
            <button className="round-add" onClick={openRecurringModal}>＋</button>
          </div>
          <div className="goals">
            {recurring.length === 0
              ? <p style={{ color: "#9aa5a2", fontSize: 12, padding: "6px 0" }}>Belum ada jadwal. Klik ＋ untuk gaji atau langganan otomatis.</p>
              : recurring.map(r => {
                const active = Boolean(r.is_active);
                const overdue = active && String(r.next_run_date).slice(0, 10) <= new Date().toISOString().slice(0, 10);
                return <div key={r.id} className={"goal-item" + (active ? "" : " paused")}>
                  <div className="budget-head">
                    <b>{r.type === "income" ? "↓ " : "↑ "}{r.title}</b>
                    <div className="tx-actions">
                      <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => openEditRecurring(r)} title="Ubah jadwal">✎</button>
                      <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => toggleRecurring(r)} title={active ? "Jeda" : "Aktifkan"}>{active ? "⏸" : "▶"}</button>
                      <button type="button" className="tx-delete" style={{ opacity: 1 }} onClick={() => deleteRecurring(r)} title="Hapus">×</button>
                    </div>
                  </div>
                  <div className="budget-numbers"><span>{r.type === "income" ? "+" : "-"}{maskRp(Number(r.amount))}</span><small>{freqLabel(String(r.frequency))} • {r.account ?? "—"}</small></div>
                  <small className={"budget-note " + (overdue ? "warn" : "")}>
                    {active ? (overdue ? `Jatuh tempo ${r.next_run_date} — jalan saat buka app.` : `Berikutnya ${r.next_run_date}`) : "Dijeda — tidak auto-jalan."}
                    {r.category ? ` • ${r.category}` : ""}
                  </small>
                </div>;
              })}
          </div>
          <div className="section-title" style={{ marginTop: 26 }}>
            <div><h2>Patungan</h2><p>Bagi tagihan dengan teman</p></div>
            <button className="round-add" onClick={openSplitModal}>＋</button>
          </div>
          <div className="goals">
            {splits.length === 0
              ? <p style={{ color: "#9aa5a2", fontSize: 12, padding: "6px 0" }}>Belum ada patungan. Klik ＋ untuk makan bareng, villa, kado.</p>
              : splits.map(s => {
                const done = s.remaining <= 0;
                return <div key={s.id} className={"goal-item" + (done ? " done" : "")}>
                  <div className="budget-head">
                    <b>{done ? "✓ " : ""}{s.title}</b>
                    <div className="tx-actions">
                      <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => openEditSplit(s)} title="Ubah patungan">✎</button>
                      <button type="button" className="budget-delete" onClick={() => deleteSplit(s)} title="Hapus">×</button>
                    </div>
                  </div>
                  <div className="budget-numbers"><span>{maskRp(s.paid)}</span><small>dari {maskRp(s.shared)} • {formatDate(s.split_date)}</small></div>
                  <div className="budget-bar goal"><span style={{ width: `${s.shared > 0 ? Math.min(100, (s.paid / s.shared) * 100) : 0}%` }} /></div>
                  <small className={"budget-note " + (done ? "safe" : "")}>
                    {done ? "Semua sudah bayar — beres!" : `Sisa tagihan ${maskRp(s.remaining)} • total ${maskRp(Number(s.total_amount))}`}
                  </small>
                  {s.members.map(m => {
                    const mDone = Number(m.paid_amount) >= Number(m.share_amount);
                    return <div key={m.id} className="category-row">
                      <span><i className="dot" style={{ background: mDone ? "#159354" : "#d69a1f" }} /> {m.name}</span>
                    <span><b>{maskRp(Number(m.paid_amount))}/{maskRp(Number(m.share_amount))}</b> {!mDone && <button type="button" className="cat-save" style={{ marginLeft: 6 }} onClick={() => openPayModal(s, m)}>Bayar</button>}</span>
                    </div>;
                  })}
                </div>;
              })}
          </div>
          <div className="section-title" style={{ marginTop: 26 }} id="utang">
            <div><h2>Utang & Piutang</h2><p>{debts.length > 0 ? `${debts.length} belum lunas` : "Catat pinjaman & tagihan"}</p></div>
            <div style={{display:"flex",gap:8}}>
              {debts.length > 2 && <button type="button" className="clear-filter" onClick={() => setDebtOpen(v => !v)}>{debtOpen ? "Tutup ▴" : `Lihat semua (${debts.length}) ▾`}</button>}
              <button className="round-add" onClick={() => openDebtModal("debt")}>＋</button>
            </div>
          </div>
          <div className="goals">
            {debts.length === 0
              ? <p style={{ color: "#9aa5a2", fontSize: 12, padding: "6px 0" }}>Belum ada utang/piutang. Klik ＋ untuk mencatat.</p>
              : (debtOpen ? debts : debts.slice(0, 2)).map(d => {
                const total = Number(d.amount);
                const paid = Number(d.paid);
                const rest = Math.max(0, Number(d.remaining ?? (total - paid)));
                const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
                const overdue = d.due_date && String(d.due_date).slice(0, 10) < todayStr();
                return <div key={d.id} className="goal-item">
                  <div className="budget-head">
                    <b>{d.kind === "debt" ? "↑ " : "↓ "}{d.person}</b>
                    <div className="tx-actions">
                      <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => openEditDebt(d)} title="Ubah">✎</button>
                      <button type="button" className="budget-delete" onClick={() => deleteDebt(d)} title="Hapus">×</button>
                    </div>
                  </div>
                  <div className="budget-numbers"><span>{maskRp(rest)}</span><small>sisa dari {maskRp(total)} • {d.kind === "debt" ? "Utang" : "Piutang"}{(() => { const info = debtInstallmentInfo(d); return info.total > 0 ? ` • cicilan ${Math.min(info.done, info.total)}/${info.total}` : ""; })()}</small></div>
                  <div className="budget-bar goal"><span style={{ width: `${pct}%` }} /></div>
                  <small className={"budget-note " + (overdue ? "over" : "")}>
                    {overdue ? `Jatuh tempo ${d.due_date} — segera lunasi. ` : d.due_date ? `Tenggat ${d.due_date} • ` : ""}{d.note || `Terbayar ${maskRp(paid)}`}
                    {(() => { const info = debtInstallmentInfo(d); return info.total > 0 ? ` • bayar ${maskRp(info.nextAmount)} untuk cicilan ${info.nextNo}/${info.total}` : ""; })()}
                  </small>
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <button type="button" className="goal-cta" style={{marginTop:0}} onClick={() => openPayDebt(d)}>Bayar{(() => { const info = debtInstallmentInfo(d); return info.total > 0 ? ` cicilan ${info.nextNo}/${info.total} • ${maskRp(info.nextAmount)}` : ` • ${maskRp(rest)}`; })()}</button>
                  </div>
                </div>;
              })}
          </div>
          {debtHistory.length > 0 && <div className="section-title" style={{ marginTop: 18 }}>
            <div><h2 style={{fontSize:15}}>Riwayat lunas</h2><p>{debtHistory.length} selesai</p></div>
            <button type="button" className="clear-filter" onClick={() => setDebtHistoryOpen(v => !v)}>{debtHistoryOpen ? "Tutup ▴" : `Lihat ▾`}</button>
          </div>}
          {debtHistoryOpen && debtHistory.length > 0 && <div className="goals">
            {debtHistory.map(d => <div key={d.id} className="goal-item done">
              <div className="budget-head">
                <b>✓ {d.person}</b>
                <div className="tx-actions">
                  <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => reopenDebt(d)} title="Kembalikan ke belum lunas">↩</button>
                  <button type="button" className="budget-delete" onClick={() => deleteDebtHistory(d)} title="Hapus riwayat">×</button>
                </div>
              </div>
              <div className="budget-numbers"><span>{maskRp(Number(d.amount))}</span><small>{d.kind === "debt" ? "Utang" : "Piutang"} • lunas</small></div>
              <small className="budget-note safe">Selesai {d.updated_at ? String(d.updated_at).slice(0, 10) : ""}{d.due_date ? ` • tenggat ${d.due_date}` : ""}</small>
            </div>)}
          </div>}
        </aside>
      </section>
    </section>

    {open && <div className="modal-layer" onMouseDown={closeTransactionDialog}>
      {!transactionType ? <section className="modal transaction-type-modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeTransactionDialog}>×</button>
        <p className="eyebrow">TRANSAKSI BARU</p>
        <h2>Pilih jenis transaksi</h2>
        <p className="modal-description">Pilih aktivitas yang ingin kamu catat terlebih dahulu.</p>
        <div className="transaction-type-options">
          <button type="button" className="transaction-type income" onClick={() => setTransactionType("income")}><span>↓</span><b>Pemasukan</b><small>Uang yang kamu terima</small></button>
          <button type="button" className="transaction-type expense" onClick={() => setTransactionType("expense")}><span>↑</span><b>Pengeluaran</b><small>Uang yang kamu keluarkan</small></button>
        </div>
      </section> : <form className="modal" onSubmit={submitTransaction} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeTransactionDialog}>×</button>
        <p className="eyebrow">{transactionType === "income" ? "PEMASUKAN BARU" : "PENGELUARAN BARU"}</p>
        <h2>Catat {transactionType === "income" ? "pemasukan" : "pengeluaran"}</h2>
        <div className="scan-box">
          <label className="scan-pick">📷 Scan struk
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={scanBusy} onChange={e => scanReceipt(e.target.files?.[0])} />
          </label>
          {scanBusy && <small>Memindai… {scanProgress > 0 ? `${scanProgress}%` : ""}</small>}
          {!scanBusy && scanFileName && <small>{scanFileName} • nominal terisi otomatis, cek lagi ya</small>}
        </div>
        {scanPreview && <img className="scan-preview" src={scanPreview} alt={scanFileName} />}
        <label>Nama transaksi<input name="title" placeholder={transactionType === "income" ? "Contoh: Gaji bulanan" : "Contoh: Makan siang"} required /></label>
        <div className="form-row">
          <label>Kategori<select name="category">{categories.filter(c => c.type === transactionType).map(c => <option key={c.id}>{c.name}</option>)}</select></label>
          <label>Akun<select name="account">{accounts.map(a => <option key={a.id}>{a.name}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Nominal<input name="amount" inputMode="numeric" type="text" placeholder="0" required value={amountDisplay} onChange={e => setAmountDisplay(formatRibuan(e.target.value))} /></label>
          <label>Tanggal<input type="date" required value={txDate} max={todayStr()} onChange={e => setTxDate(e.target.value)} /></label>
        </div>
        <button className="submit" type="submit">Simpan {transactionType === "income" ? "pemasukan" : "pengeluaran"}</button>
      </form>}
    </div>}

    {accountModal && <div className="modal-layer" onMouseDown={closeAccountModal}>
      <form className="modal" onSubmit={submitAccount} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeAccountModal}>×</button>
        <p className="eyebrow">AKUN BARU</p>
        <h2>Tambah akun bank</h2>
        <label>Nama akun<input name="name" placeholder="Contoh: BCA" required /></label>
        <div className="form-row">
          <label>Jenis<select name="account_type"><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="cash">Tunai</option><option value="credit_card">Kartu Kredit</option></select></label>
          <label>4 digit akhir (opsional)<input name="last4" inputMode="numeric" maxLength={4} placeholder="Opsional" autoComplete="off" /></label>
        </div>
        <label>Saldo awang<input name="opening_balance" inputMode="numeric" type="text" placeholder="0" required value={balanceDisplay} onChange={e => setBalanceDisplay(formatRibuan(e.target.value))} /></label>
        <button className="submit" type="submit">Simpan akun</button>
      </form>
    </div>}

    {editingAccount && <div className="modal-layer" onMouseDown={closeEditAccount}>
      <form className="modal" onSubmit={submitEditAccount} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeEditAccount}>×</button>
        <p className="eyebrow">UBAH AKUN</p>
        <h2>Ubah {editingAccount.name}</h2>
        <p className="modal-description">Saldo berjalan: {maskRp(Number(editingAccount.current_balance))}. Ubah saldo awal bila perlu koreksi.</p>
        <label>Nama akun<input value={editAccName} onChange={e => setEditAccName(e.target.value)} required maxLength={100} /></label>
        <div className="form-row">
          <label>Jenis<select value={editAccType} onChange={e => setEditAccType(e.target.value)}><option value="bank">Bank</option><option value="ewallet">E-Wallet</option><option value="cash">Tunai</option><option value="credit_card">Kartu Kredit</option><option value="investment">Investasi</option></select></label>
          <label>4 digit akhir (opsional)<input value={editAccLast4} onChange={e => setEditAccLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} maxLength={4} placeholder="Opsional" autoComplete="off" inputMode="numeric" /></label>
        </div>
        <label>Saldo awal<input inputMode="numeric" type="text" value={editAccBalanceDisplay} onChange={e => setEditAccBalanceDisplay(formatRibuan(e.target.value))} /></label>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {budgetModal && <div className="modal-layer" onMouseDown={closeBudgetModal}>
      <form className="modal" onSubmit={submitBudget} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeBudgetModal}>×</button>
        <p className="eyebrow">ANGGARAN BULANAN</p>
        <h2>Atur batas belanja</h2>
        <p className="modal-description">Berlaku untuk bulan berjalan. Contoh: Makan &amp; Minum Rp 1.000.000.</p>
        <label>Kategori pengeluaran<select name="category">{categories.filter(c => c.type === "expense").map(c => <option key={c.id}>{c.name}</option>)}{categories.filter(c => c.type === "expense").length === 0 && <option value="">Belum ada kategori</option>}</select></label>
        <label>Batas per bulan<input name="amount" inputMode="numeric" type="text" placeholder="0" required value={budgetDisplay} onChange={e => setBudgetDisplay(formatRibuan(e.target.value))} /></label>
        <button className="submit" type="submit">Simpan anggaran</button>
      </form>
    </div>}

    {editing && <div className="modal-layer" onMouseDown={closeEdit}>
      <form className="modal" onSubmit={submitEdit} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeEdit}>×</button>
        <p className="eyebrow">UBAH TRANSAKSI</p>
        <h2>Ubah {editing.type === "income" ? "pemasukan" : "pengeluaran"}</h2>
        <label>Nama transaksi<input value={editTitle} onChange={e => setEditTitle(e.target.value)} required /></label>
        <div className="form-row">
          <label>Kategori<select value={editCategory} onChange={e => setEditCategory(e.target.value)}>{categories.filter(c => c.type === editing.type).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
          <label>Akun<select value={editAccount} onChange={e => setEditAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}{editAccount && !accounts.some(a => a.id === editAccount) && <option value={editAccount}>{editing.account || "Akun arsip / tidak tersedia"}</option>}</select></label>
        </div>
        <div className="form-row">
          <label>Nominal<input inputMode="numeric" type="text" required value={editAmount} onChange={e => setEditAmount(formatRibuan(e.target.value))} /></label>
          <label>Tanggal<input type="date" required value={editDate} onChange={e => setEditDate(e.target.value)} /></label>
        </div>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {transferModal && <div className="modal-layer" onMouseDown={closeTransferModal}>
      <form className="modal" onSubmit={submitTransfer} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeTransferModal}>×</button>
        <p className="eyebrow">{editingTransfer ? "UBAH TRANSFER" : "PINDAH SALDO"}</p>
        <h2>{editingTransfer ? "Ubah transfer" : "Transfer antar akun"}</h2>
        <p className="modal-description">Contoh: pindah Rp 500.000 dari BCA ke DANA. Saldo kedua akun otomatis menyesuaikan.</p>
        <div className="form-row">
          <label>Dari akun<select value={transferFrom} onChange={e => setTransferFrom(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.name}>{a.name} • {rupiah(Number(a.current_balance))}</option>)}</select></label>
          <label>Ke akun<select value={transferTo} onChange={e => setTransferTo(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Nominal transfer<input inputMode="numeric" type="text" placeholder="0" required value={transferAmountDisplay} onChange={e => setTransferAmountDisplay(formatRibuan(e.target.value))} /></label>
          <label>Tanggal<input type="date" required value={transferDate} max={todayStr()} onChange={e => setTransferDate(e.target.value)} /></label>
        </div>
        <label>Catatan (opsional)<input value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="Contoh: Isi DANA" /></label>
        <button className="submit" type="submit">{editingTransfer ? "Simpan perubahan" : "Kirim transfer"}</button>
      </form>
    </div>}

    {goalModal && <div className="modal-layer" onMouseDown={closeGoalModal}>
      <form className="modal" onSubmit={submitGoal} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeGoalModal}>×</button>
        <p className="eyebrow">TARGET BARU</p>
        <h2>Buat target tabungan</h2>
        <p className="modal-description">Contoh: Dana darurat Rp 10.000.000 dengan tenggat akhir tahun.</p>
        <label>Nama target<input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Contoh: Dana darurat" required /></label>
        <div className="form-row">
          <label>Target nominal<input inputMode="numeric" type="text" placeholder="0" required value={goalTargetDisplay} onChange={e => setGoalTargetDisplay(formatRibuan(e.target.value))} /></label>
          <label>Tenggat (opsional)<input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} /></label>
        </div>
        <button className="submit" type="submit">Buat target</button>
      </form>
    </div>}

    {allocModal && <div className="modal-layer" onMouseDown={closeAllocModal}>
      <form className="modal" onSubmit={submitAllocation} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeAllocModal}>×</button>
        <p className="eyebrow">KELOLA DANA</p>
        <h2>{allocModal.name}</h2>
        <p className="modal-description">Terkumpul {maskRp(Number(allocModal.saved) || 0)} dari {maskRp(Number(allocModal.target_amount) || 0)}.</p>
        <div className="alloc-toggle">
          <button type="button" className={allocDirection === "deposit" ? "selected" : ""} onClick={() => setAllocDirection("deposit")}>＋ Nabung</button>
          <button type="button" className={allocDirection === "withdraw" ? "selected" : ""} onClick={() => setAllocDirection("withdraw")}>− Tarik</button>
        </div>
        <div className="form-row">
          <label>Sumber akun (opsional)<select value={allocAccount} onChange={e => setAllocAccount(e.target.value)}><option value="">Tanpa akun</option>{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></label>
          <label>Nominal<input inputMode="numeric" type="text" placeholder="0" required value={allocAmountDisplay} onChange={e => setAllocAmountDisplay(formatRibuan(e.target.value))} /></label>
        </div>
        <label>Catatan (opsional)<input value={allocNote} onChange={e => setAllocNote(e.target.value)} placeholder="Contoh: Sisihan gaji" /></label>
        <button className="submit" type="submit">{allocDirection === "deposit" ? "Tambah dana" : "Tarik dana"}</button>
        {allocHistory.length > 0 && <div className="alloc-history">
          <b>Riwayat</b>
          {allocHistory.map(h => <div key={h.id} className="alloc-row">
            <span>{Number(h.amount) >= 0 ? "＋" : "−"} {maskRp(Math.abs(Number(h.amount)))} <small>• {h.account ?? "manual"} • {formatDate(h.allocation_date)}</small></span>
          </div>)}
        </div>}
      </form>
    </div>}

    {categoryModal && <div className="modal-layer" onMouseDown={closeCategoryModal}>
      <section className="modal category-modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeCategoryModal}>×</button>
        <p className="eyebrow">KELOLA KATEGORI</p>
        <h2>Kategori transaksi</h2>
        <div className="alloc-toggle">
          <button type="button" className={categoryTab === "expense" ? "selected" : ""} onClick={() => setCategoryTab("expense")}>Pengeluaran</button>
          <button type="button" className={categoryTab === "income" ? "selected" : ""} onClick={() => setCategoryTab("income")}>Pemasukan</button>
        </div>
        <form onSubmit={submitCategory} className="category-add">
          <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={categoryTab === "income" ? "Contoh: Gaji, Bonus" : "Contoh: Jajan, Langganan"} maxLength={80} required />
          <input type="color" value={newCategoryColor} onChange={e => setNewCategoryColor(e.target.value)} title="Warna grafik" />
          <button className="submit" type="submit" style={{ marginTop: 0 }}>＋</button>
        </form>
        <div className="category-list">
          {categories.filter(c => c.type === categoryTab).length === 0 && <p style={{ color: "#9aa5a2", fontSize: 12 }}>Belum ada kategori {categoryTab === "income" ? "pemasukan" : "pengeluaran"}.</p>}
          {categories.filter(c => c.type === categoryTab).map(c => editingCategory?.id === c.id ? <form key={c.id} onSubmit={submitCategoryEdit} className="category-row-edit">
            <span className="cat-dot" style={{ background: editingCategory.color || "#286c56" }} />
            <input value={editingCategory.name} onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })} maxLength={80} required />
            <input type="color" value={editingCategory.color || "#286c56"} onChange={e => setEditingCategory({ ...editingCategory, color: e.target.value })} title="Warna" />
            <button type="submit" className="cat-save">✓</button>
            <button type="button" className="cat-cancel" onClick={() => setEditingCategory(null)}>×</button>
          </form> : <div key={c.id} className="category-item">
            <span className="cat-dot" style={{ background: c.color || "#8ca39e" }} />
            <div><b>{c.name}</b><small>{Number(c.usage_count ?? 0)} transaksi{c.is_default ? " • bawaan" : ""}</small></div>
            <button type="button" className="tx-edit" style={{ opacity: 1 }} onClick={() => setEditingCategory({ ...c })} title="Ubah">✎</button>
            <button type="button" className="tx-delete" style={{ opacity: 1 }} onClick={() => deleteCategory(c)} title="Hapus">×</button>
          </div>)}
        </div>
        <p className="modal-description" style={{ margin: "14px 0 0" }}>Kategori yang sudah dipakai transaksi akan diarsipkan (tidak hilang dari riwayat). Warna dipakai di grafik donat.</p>
      </section>
    </div>}

    {recurringModal && <div className="modal-layer" onMouseDown={closeRecurringModal}>
      <form className="modal" onSubmit={submitRecurring} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeRecurringModal}>×</button>
        <p className="eyebrow">JADWAL RUTIN</p>
        <h2>Buat transaksi otomatis</h2>
        <p className="modal-description">Contoh: gaji tiap bulan atau langganan tiap minggu. Berjalan otomatis saat kamu buka aplikasi.</p>
        <label>Nama jadwal<input value={recTitle} onChange={e => setRecTitle(e.target.value)} placeholder="Contoh: Gaji bulanan" required maxLength={200} /></label>
        <div className="alloc-toggle">
          <button type="button" className={recType === "expense" ? "selected" : ""} onClick={() => { setRecType("expense"); setRecCategory(categories.find(c => c.type === "expense")?.name ?? ""); }}>↑ Pengeluaran</button>
          <button type="button" className={recType === "income" ? "selected" : ""} onClick={() => { setRecType("income"); setRecCategory(categories.find(c => c.type === "income")?.name ?? ""); }}>↓ Pemasukan</button>
        </div>
        <div className="form-row">
          <label>Kategori<select value={recCategory} onChange={e => setRecCategory(e.target.value)}>{categories.filter(c => c.type === recType).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
          <label>Akun<select value={recAccount} onChange={e => setRecAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Nominal<input inputMode="numeric" type="text" placeholder="0" required value={recAmountDisplay} onChange={e => setRecAmountDisplay(formatRibuan(e.target.value))} /></label>
          <label>Frekuensi<select value={recFrequency} onChange={e => setRecFrequency(e.target.value)}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></select></label>
        </div>
        <div className="form-row">
          <label>Mulai tanggal<input type="date" required value={recStart} onChange={e => setRecStart(e.target.value)} /></label>
          <label>Berakhir (opsional)<input type="date" value={recEnd} min={recStart || undefined} onChange={e => setRecEnd(e.target.value)} /></label>
        </div>
        <button className="submit" type="submit">Buat jadwal</button>
      </form>
    </div>}

    {splitModal && <div className="modal-layer" onMouseDown={closeSplitModal}>
      <form className="modal" onSubmit={submitSplit} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeSplitModal}>×</button>
        <p className="eyebrow">PATUNGAN BARU</p>
        <h2>Bagi tagihan</h2>
        <p className="modal-description">Contoh: makan bareng Rp 300.000 dengan 2 teman — tiap orang Rp 100.000 termasuk kamu.</p>
        <label>Judul<input value={splitTitle} onChange={e => setSplitTitle(e.target.value)} placeholder="Contoh: Makan bareng" required maxLength={200} /></label>
        <div className="form-row">
          <label>Total tagihan<input inputMode="numeric" type="text" placeholder="0" required value={splitTotalDisplay} onChange={e => setSplitTotalDisplay(formatRibuan(e.target.value))} /></label>
          <label>Tanggal<input type="date" value={splitDate} onChange={e => setSplitDate(e.target.value)} /></label>
        </div>
        <div className="form-row">
          <label>Akun talangan (opsional)<select value={splitAccount} onChange={e => setSplitAccount(e.target.value)}><option value="">Tanpa akun</option>{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></label>
          <label>Estimasi /orang<input type="text" readOnly value={splitPreview().each.length > 0 ? maskRp(splitPreview().each[0]) : ""} placeholder="—" /></label>
        </div>
        <label>Nama teman (pisahkan koma)<input value={splitNames} onChange={e => setSplitNames(e.target.value)} placeholder="Contoh: Budi, Sinta" required /></label>
        {splitPreview().names.length > 0 && <div className="import-preview">
          {splitPreview().names.map((n, i) => <div key={n + i} className="category-row">
            <span>{n}</span><b>{maskRp(splitPreview().each[i] || 0)}</b>
          </div>)}
        </div>}
        <button className="submit" type="submit">Buat patungan</button>
      </form>
    </div>}

    {editingRec && <div className="modal-layer" onMouseDown={() => setEditingRec(null)}>
      <form className="modal" onSubmit={submitEditRecurring} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setEditingRec(null)}>×</button>
        <p className="eyebrow">UBAH JADWAL</p>
        <h2>Ubah {editingRec.title}</h2>
        <p className="modal-description">Perubahan berlaku untuk jadwal berikutnya. Transaksi yang sudah dibuat tidak ikut berubah.</p>
        <label>Nama jadwal<input value={editRecTitle} onChange={e => setEditRecTitle(e.target.value)} required maxLength={200} /></label>
        <div className="alloc-toggle">
          <button type="button" className={editRecType === "expense" ? "selected" : ""} onClick={() => { setEditRecType("expense"); setEditRecCategory(categories.find(c => c.type === "expense")?.name ?? ""); }}>↑ Pengeluaran</button>
          <button type="button" className={editRecType === "income" ? "selected" : ""} onClick={() => { setEditRecType("income"); setEditRecCategory(categories.find(c => c.type === "income")?.name ?? ""); }}>↓ Pemasukan</button>
        </div>
        <div className="form-row">
          <label>Kategori<select value={editRecCategory} onChange={e => setEditRecCategory(e.target.value)}><option value="">Tanpa kategori</option>{categories.filter(c => c.type === editRecType).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
          <label>Akun<select value={editRecAccount} onChange={e => setEditRecAccount(e.target.value)}><option value="">Tetap</option>{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Nominal<input inputMode="numeric" type="text" placeholder="0" required value={editRecAmountDisplay} onChange={e => setEditRecAmountDisplay(formatRibuan(e.target.value))} /></label>
          <label>Frekuensi<select value={editRecFrequency} onChange={e => setEditRecFrequency(e.target.value)}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></select></label>
        </div>
        <div className="form-row">
          <label>Jadwal berikut<input type="date" required value={editRecStart} onChange={e => setEditRecStart(e.target.value)} /></label>
          <label>Berakhir (opsional)<input type="date" value={editRecEnd} min={editRecStart || undefined} onChange={e => setEditRecEnd(e.target.value)} /></label>
        </div>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {editingSplit && <div className="modal-layer" onMouseDown={() => setEditingSplit(null)}>
      <form className="modal" onSubmit={submitEditSplit} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setEditingSplit(null)}>×</button>
        <p className="eyebrow">UBAH PATUNGAN</p>
        <h2>Ubah {editingSplit.title}</h2>
        <p className="modal-description">Porsi anggota dihitung ulang proporsional. Pembayaran yang sudah masuk dipertahankan per nama.</p>
        <label>Judul<input value={editSplitTitle} onChange={e => setEditSplitTitle(e.target.value)} required maxLength={200} /></label>
        <div className="form-row">
          <label>Total tagihan<input inputMode="numeric" type="text" placeholder="0" required value={editSplitTotalDisplay} onChange={e => setEditSplitTotalDisplay(formatRibuan(e.target.value))} /></label>
          <label>Tanggal<input type="date" value={editSplitDate} onChange={e => setEditSplitDate(e.target.value)} /></label>
        </div>
        <label>Akun talangan (opsional)<select value={editSplitAccount} onChange={e => setEditSplitAccount(e.target.value)}><option value="">Tanpa akun</option>{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></label>
        <label>Catatan (opsional)<input value={editSplitNote} onChange={e => setEditSplitNote(e.target.value)} placeholder="Contoh: Makan bareng" maxLength={255} /></label>
        <label>Nama teman (pisahkan koma)<input value={editSplitNames} onChange={e => setEditSplitNames(e.target.value)} required /></label>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {editingDebt && <div className="modal-layer" onMouseDown={() => setEditingDebt(null)}>
      <form className="modal" onSubmit={submitEditDebt} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setEditingDebt(null)}>×</button>
        <p className="eyebrow">UBAH {editingDebt.kind === "debt" ? "UTANG" : "PIUTANG"}</p>
        <h2>Ubah {editingDebt.person}</h2>
        <p className="modal-description">Sudah terbayar {maskRp(Number(editingDebt.paid))}. Nominal baru tidak boleh lebih kecil dari itu.</p>
        <div className="alloc-toggle">
          <button type="button" className={editDebtKind === "debt" ? "selected" : ""} onClick={() => setEditDebtKind("debt")}>↑ Utang saya</button>
          <button type="button" className={editDebtKind === "receivable" ? "selected" : ""} onClick={() => setEditDebtKind("receivable")}>↓ Piutang</button>
        </div>
        <label>Nama orang<input value={editDebtPerson} onChange={e => setEditDebtPerson(e.target.value)} required maxLength={120} /></label>
        <div className="form-row">
          <label>Nominal (keseluruhan)<input inputMode="numeric" type="text" placeholder="0" required value={editDebtAmountDisplay} onChange={e => setEditDebtAmountDisplay(formatRibuan(e.target.value))} /></label>
          <label>Cicil berapa kali?<select value={editDebtTimes} onChange={e => setEditDebtTimes(e.target.value)}>
            <option value="">Sekaligus (lunas)</option>
            {[2, 3, 4, 5, 6, 10, 12].map(n => <option key={n} value={n}>{n}× cicilan</option>)}
          </select></label>
        </div>
        {(() => {
          const total = parseRibuan(editDebtAmountDisplay);
          const n = parseInt(editDebtTimes, 10);
          if (!total || total < 1 || !n || n < 1) return null;
          return <p className="modal-description" style={{marginTop:-8}}>Total {maskRp(total)} dibagi {n}× → {maskRp(Math.max(1, Math.round(total / n)))}/cicilan.</p>;
        })()}
        <label>Jatuh tempo (opsional)<input type="date" value={editDebtDue} onChange={e => setEditDebtDue(e.target.value)} /></label>
        <label>Catatan (opsional)<input value={editDebtNote} onChange={e => setEditDebtNote(e.target.value)} maxLength={500} /></label>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {payModal && <div className="modal-layer" onMouseDown={closePayModal}>
      <form className="modal" onSubmit={submitPay} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closePayModal}>×</button>
        <p className="eyebrow">CATAT PEMBAYARAN</p>
        <h2>{payModal.member.name}</h2>
        <p className="modal-description">Tagihan {maskRp(Number(payModal.member.share_amount))}, sudah bayar {maskRp(Number(payModal.member.paid_amount))}. Sisa {maskRp(Number(payModal.member.share_amount) - Number(payModal.member.paid_amount))} untuk {payModal.split.title}.</p>
        <label>Nominal bayar<input inputMode="numeric" type="text" placeholder="0" required value={payAmountDisplay} onChange={e => setPayAmountDisplay(formatRibuan(e.target.value))} /></label>
        <button className="submit" type="submit">Catat bayar</button>
      </form>
    </div>}

    {payingDebt && <div className="modal-layer" onMouseDown={() => setPayingDebt(null)}>
      <form className="modal" onSubmit={submitPayDebt} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setPayingDebt(null)}>×</button>
        <p className="eyebrow">{payingDebt.kind === "debt" ? "BAYAR UTANG" : "TERIMA PIUTANG"}</p>
        <h2>{payingDebt.person}</h2>
        {(() => {
          const info = debtInstallmentInfo(payingDebt);
          const txType = payingDebt.kind === "debt" ? "expense" : "income";
          return <>
            <p className="modal-description">Total {maskRp(Number(payingDebt.amount))} • terbayar {maskRp(Number(payingDebt.paid))} • sisa {maskRp(info.rest)}.</p>
            <div className="report-card recon" style={{margin:"0 0 14px"}}>
              {info.total > 0
                ? <><b className="report-subtitle">Cicilan {info.nextNo} dari {info.total}</b>
                  <div className="category-row"><span>Nominal cicilan ini</span><b>{maskRp(info.nextAmount)}</b></div>
                  <div className="category-row"><span>Sisa setelah bayar ini</span><b>{maskRp(Math.max(0, info.rest - info.nextAmount))}</b></div>
                  <p className="report-empty" style={{margin:"8px 0 0"}}>Klik Bayar untuk mencatat cicilan ini. Transaksi otomatis tercatat & saldo akun berkurang. Ulangi tiap kali bayar sampai lunas.</p></>
                : <><b className="report-subtitle">Pelunasan sekaligus</b>
                  <div className="category-row"><span>Nominal dibayar</span><b>{maskRp(info.rest)}</b></div>
                  <p className="report-empty" style={{margin:"8px 0 0"}}>Tanpa rencana cicilan — klik Bayar untuk melunasi. Transaksi otomatis tercatat.</p></>}
            </div>
            <div className="form-row">
              <label>Kategori<select value={payDebtCategory} onChange={e => setPayDebtCategory(e.target.value)}>{categories.filter(c => c.type === txType).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}{categories.filter(c => c.type === txType).length === 0 && <option value="">{payingDebt.kind === "debt" ? "Utang (otomatis)" : "Piutang (otomatis)"}</option>}</select></label>
              <label>{payingDebt.kind === "debt" ? "Bayar dari akun" : "Terima ke akun"}<select value={payDebtAccount} onChange={e => setPayDebtAccount(e.target.value)} required>{accounts.length === 0 && <option value="">Belum ada akun</option>}{accounts.map(a => <option key={a.id} value={a.name}>{a.name} • {rupiah(Number(a.current_balance))}</option>)}</select></label>
            </div>
            <button className="submit" type="submit">Bayar {info.total > 0 ? `cicilan ${info.nextNo}/${info.total} • ${maskRp(info.nextAmount)}` : maskRp(info.rest)}</button>
          </>;
        })()}
      </form>
    </div>}

    {reportModal && <div className="modal-layer report-layer" onMouseDown={() => setReportModal(false)}>
      <section className="modal report-modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close no-print" onClick={() => setReportModal(false)}>×</button>
        <p className="eyebrow">LAPORAN KEUANGAN</p>
        <h2>Rekap {reportData.monthLabel}</h2>
        <p className="print-meta">Ruang Saku • {session?.user?.name ?? "Pengguna"} • Dicetak {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
        <div className="report-controls no-print">
          <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
          <div className="report-buttons">
            <button type="button" className="clear-filter" onClick={exportReportCsv}>⭳ CSV</button>
            <button type="button" className="clear-filter" onClick={shareReportPdf}>⇪ Bagikan</button>
            <button type="button" className="clear-filter primary" onClick={printReport}>⎙ Cetak / PDF</button>
          </div>
        </div>
        {reportData.list.length === 0 ? <p className="report-empty">Belum ada transaksi pada {reportData.monthLabel}. Pilih bulan lain.</p> : <>
        <div className="report-grid">
          <div className="report-card in"><small>Pemasukan {reportData.monthLabel}</small><b>{maskRp(reportData.income)}</b><span className={reportData.deltaIncome >= 0 ? "up" : "down"}>{reportData.deltaIncome >= 0 ? "▲" : "▼"} {Math.abs(reportData.deltaIncome).toFixed(0)}% vs bulan lalu</span></div>
          <div className="report-card out"><small>Pengeluaran {reportData.monthLabel}</small><b>{maskRp(reportData.expense)}</b><span className={reportData.deltaExpense <= 0 ? "up" : "down"}>{reportData.deltaExpense >= 0 ? "▲" : "▼"} {Math.abs(reportData.deltaExpense).toFixed(0)}% vs bulan lalu</span></div>
          <div className={"report-card net" + (reportData.net >= 0 ? " plus" : " minus")}><small>Arus bersih (bukan saldo total)</small><b>{reportData.net >= 0 ? "+" : "−"}{maskRp(Math.abs(reportData.net))}</b><span>{reportData.count} transaksi • nabung {reportData.rate.toFixed(0)}% dari masuk</span></div>
        </div>
        <div className="report-card recon">
          <b className="report-subtitle">Kenapa beda dengan Saldo total?</b>
          <p className="report-empty" style={{margin:"0 0 8px"}}>Arus bersih hanya arus {reportData.monthLabel}. Saldo total mencakup saldo awal + seluruh riwayat.</p>
          <div className="category-row"><span>Saldo awal semua akun</span><b>{maskRp(reportData.openingTotal)}</b></div>
          <div className="category-row"><span>Arus {reportData.monthLabel} (masuk − keluar)</span><b className={reportData.net >= 0 ? "income" : "expense"}>{reportData.net >= 0 ? "+" : "−"}{maskRp(Math.abs(reportData.net))}</b></div>
          <div className="category-row"><span>Arus bulan lain + transfer masuk/keluar</span><b>{reportData.otherNet >= 0 ? "+" : "−"}{maskRp(Math.abs(reportData.otherNet))}</b></div>
          <div className="category-row" style={{borderTop:"2px solid var(--line)",paddingTop:8,marginTop:4}}><span><b>Saldo total saat ini</b></span><b>{maskRp(reportData.currentTotal)}</b></div>
        </div>
        <div className="report-cols">
          <div>
            <b className="report-subtitle">Top kategori keluar</b>
            {reportData.topCats.length === 0 ? <p className="report-empty">Belum ada pengeluaran bulan ini.</p> : reportData.topCats.map(c => <div key={c.name} className="category-row">
              <span><i className="dot" style={{ background: c.color }} /> {c.name}</span>
              <span><b>{maskRp(c.value)}</b> <small>{c.pct.toFixed(0)}%</small></span>
            </div>)}
          </div>
          <div>
            <b className="report-subtitle">Transaksi terbesar</b>
            {reportData.topTx.length === 0 ? <p className="report-empty">Belum ada transaksi bulan ini.</p> : reportData.topTx.map(t => <div key={t.id} className="category-row">
              <span>{t.title || "Tanpa judul"} <small>• {formatDate(t.transaction_date)}</small></span>
              <b className={t.type === "income" ? "income" : "expense"}>{t.type === "income" ? "+" : "-"}{maskRp(Number(t.amount))}</b>
            </div>)}
          </div>
        </div>
        <div className="report-table-wrap">
          <b className="report-subtitle">Rincian transaksi ({reportData.list.length})</b>
          <table className="report-table">
            <thead><tr><th>Tanggal</th><th>Judul</th><th>Tipe</th><th>Kategori</th><th>Akun</th><th className="num">Nominal</th></tr></thead>
            <tbody>
              {[...reportData.list].sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date))).map(t => <tr key={t.id}>
                <td>{String(t.transaction_date).slice(0, 10)}</td>
                <td>{t.title || "Tanpa judul"}</td>
                <td>{t.type === "income" ? "Masuk" : t.type === "expense" ? "Keluar" : t.type === "transfer_in" ? "Trf masuk" : t.type === "transfer_out" ? "Trf keluar" : t.type}</td>
                <td>{t.category || "Lainnya"}</td>
                <td>{t.account || "-"}</td>
                <td className="num">{t.type === "expense" || t.type === "transfer_out" ? "-" : "+"}{maskRp(Number(t.amount))}</td>
              </tr>)}
            </tbody>
          </table>
          <p className="report-foot">Total masuk {maskRp(reportData.income)} • keluar {maskRp(reportData.expense)} • bersih {reportData.net >= 0 ? "+" : "−"}{maskRp(Math.abs(reportData.net))} • {reportData.count} transaksi</p>
        </div>
        </>}
      </section>
    </div>}

    {receiptTx && <div className="modal-layer" onMouseDown={closeReceipt}>
      <section className="modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={closeReceipt}>×</button>
        <p className="eyebrow">LAMPIRAN STRUK</p>
        <h2>{receiptTx.title || "Tanpa judul"}</h2>
        <p className="modal-description">{maskRp(Number(receiptTx.amount))} • {receiptTx.account ?? "—"} • {formatDate(receiptTx.transaction_date)}</p>
        {receiptView ? <>
          {receiptView.mime === "application/pdf"
            ? <p className="report-empty">PDF: {receiptView.name} — <a href={`data:${receiptView.mime};base64,${receiptView.data}`} target="_blank" rel="noreferrer">buka di tab baru</a></p>
            : <img className="receipt-preview" src={`data:${receiptView.mime};base64,${receiptView.data}`} alt={receiptView.name} />}
          <div className="report-buttons" style={{ marginTop: 12 }}>
            <a className="clear-filter" style={{ textDecoration: "none" }} href={`data:${receiptView.mime};base64,${receiptView.data}`} download={receiptView.name}>⭳ Unduh</a>
            <button type="button" className="clear-filter" onClick={deleteReceipt}>Hapus struk</button>
          </div>
        </> : <>
          <label className="receipt-drop">Pilih file JPG / PNG / WebP / PDF (maks ±1,5MB)
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={receiptBusy} onChange={e => uploadReceipt(e.target.files?.[0])} />
          </label>
          {receiptBusy && <p className="report-empty">Mengunggah…</p>}
        </>}
      </section>
    </div>}

    {importModal && <div className="modal-layer" onMouseDown={() => !importBusy && setImportModal(false)}>
      <section className="modal report-modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setImportModal(false)}>×</button>
        <p className="eyebrow">IMPOR MUTASI</p>
        <h2>Impor CSV bank</h2>
        <p className="modal-description">Format: judul;tipe;kategori;akun;nominal;tanggal. Tipe: income/expense. Tanggal: YYYY-MM-DD. Maks 200 baris. Saldo dicek otomatis.</p>
        <div className="report-buttons" style={{ marginBottom: 12 }}>
          <button type="button" className="clear-filter" onClick={downloadImportTemplate}>⭳ Template</button>
          <label className="clear-filter" style={{ cursor: "pointer" }}>Pilih file CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={e => parseImportFile(e.target.files?.[0])} />
          </label>
        </div>
        {importFileName && <p className="result-count">File: {importFileName} • {importRows.length} baris</p>}
        {importErrors.length > 0 && <div className="import-errors">{importErrors.map((e, i) => <p key={i}>• {e}</p>)}</div>}
        {importRows.length > 0 && <div className="import-preview">
          <b>Preview 5 baris pertama</b>
          {importRows.slice(0, 5).map((r, i) => <div key={i} className="category-row">
            <span>{r.title} <small>• {r.type} • {r.account} • {r.date}</small></span>
            <b>{maskRp(Number(r.amount) || 0)}</b>
          </div>)}
        </div>}
        <button className="submit" type="button" disabled={importBusy || importRows.length === 0} onClick={submitImport}>{importBusy ? "Mengimpor…" : `Impor ${importRows.length} baris`}</button>
      </section>
    </div>}

    {editingBudget && <div className="modal-layer" onMouseDown={() => setEditingBudget(null)}>
      <form className="modal" onSubmit={submitEditBudget} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setEditingBudget(null)}>×</button>
        <p className="eyebrow">UBAH ANGGARAN</p>
        <h2>{editingBudget.category}</h2>
        <p className="modal-description">Terpakai {maskRp(budgetProgress.find(b => b.id === editingBudget.id)?.spent ?? 0)} bulan ini. Ubah batas tanpa buat baru.</p>
        <label>Batas per bulan<input inputMode="numeric" type="text" required value={editBudgetDisplay} onChange={e => setEditBudgetDisplay(formatRibuan(e.target.value))} /></label>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {editingGoal && <div className="modal-layer" onMouseDown={() => setEditingGoal(null)}>
      <form className="modal" onSubmit={submitEditGoal} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setEditingGoal(null)}>×</button>
        <p className="eyebrow">UBAH TARGET</p>
        <h2>Ubah {editingGoal.name}</h2>
        <label>Nama target<input value={editGoalName} onChange={e => setEditGoalName(e.target.value)} required maxLength={120} /></label>
        <div className="form-row">
          <label>Target nominal<input inputMode="numeric" type="text" required value={editGoalTargetDisplay} onChange={e => setEditGoalTargetDisplay(formatRibuan(e.target.value))} /></label>
          <label>Tenggat (opsional)<input type="date" value={editGoalDeadline} onChange={e => setEditGoalDeadline(e.target.value)} /></label>
        </div>
        <button className="submit" type="submit">Simpan perubahan</button>
      </form>
    </div>}

    {debtModal && <div className="modal-layer" onMouseDown={() => setDebtModal(false)}>
      <form className="modal" onSubmit={submitDebt} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setDebtModal(false)}>×</button>
        <p className="eyebrow">{debtKind === "debt" ? "UTANG BARU" : "PIUTANG BARU"}</p>
        <h2>{debtKind === "debt" ? "Catat utang" : "Catat piutang"}</h2>
        <p className="modal-description">{debtKind === "debt" ? "Kamu berutang ke orang lain." : "Orang lain berutang padamu."} Lunasi lewat tombol Bayar.</p>
        <div className="alloc-toggle">
          <button type="button" className={debtKind === "debt" ? "selected" : ""} onClick={() => setDebtKind("debt")}>↑ Utang saya</button>
          <button type="button" className={debtKind === "receivable" ? "selected" : ""} onClick={() => setDebtKind("receivable")}>↓ Piutang</button>
        </div>
        <label>Nama orang<input value={debtPerson} onChange={e => setDebtPerson(e.target.value)} placeholder="Contoh: Budi" required maxLength={120} /></label>
        <div className="form-row">
          <label>Nominal (keseluruhan)<input inputMode="numeric" type="text" placeholder="0" required value={debtAmountDisplay} onChange={e => setDebtAmountDisplay(formatRibuan(e.target.value))} /></label>
          <label>Cicil berapa kali?<select value={debtTimes} onChange={e => setDebtTimes(e.target.value)}>
            <option value="">Sekaligus (lunas)</option>
            {[2, 3, 4, 5, 6, 10, 12].map(n => <option key={n} value={n}>{n}× cicilan</option>)}
          </select></label>
        </div>
        {(() => {
          const total = parseRibuan(debtAmountDisplay);
          const n = parseInt(debtTimes, 10);
          if (!total || total < 1 || !n || n < 1) return null;
          const per = Math.max(1, Math.round(total / n));
          return <p className="modal-description" style={{marginTop:-8}}>Total {maskRp(total)} dibagi {n}× → {maskRp(per)}/cicilan. Nanti bayarnya dicatat satu per satu lewat tombol Bayar.</p>;
        })()}
        <label>Jatuh tempo (opsional)<input type="date" value={debtDue} onChange={e => setDebtDue(e.target.value)} /></label>
        <label>Catatan (opsional)<input value={debtNote} onChange={e => setDebtNote(e.target.value)} placeholder="Contoh: Pinjam presentasi" maxLength={500} /></label>
        <button className="submit" type="submit">Simpan</button>
      </form>
    </div>}

    {guideModal && <div className="modal-layer" onMouseDown={() => setGuideModal(false)}>
      <section className="modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => setGuideModal(false)}>×</button>
        <p className="eyebrow">PANDUAN</p>
        <h2>Cara pakai Ruang Saku</h2>
        <p className="modal-description">6 langkah mengatur keuanganmu dari nol sampai rapi.</p>
        <div className="alloc-history">
          {GUIDE_STEPS.map((s, i) => <div key={i} className="alloc-row">
            <b>{s.title}</b>
            <div><small>{s.body}</small></div>
          </div>)}
        </div>
        <button className="submit" type="button" onClick={() => setGuideModal(false)} style={{ marginTop: 16 }}>Mengerti!</button>
      </section>
    </div>}

    {confirm && <div className="confirm-layer" onMouseDown={() => !confirmBusy && setConfirm(null)}>
      <section className={"confirm-card" + (confirm.danger ? " danger" : "")} onMouseDown={e => e.stopPropagation()}>
        <div className={"confirm-icon" + (confirm.danger ? " danger" : "")}>{confirm.danger ? "!" : "?"}</div>
        <h3>{confirm.title}</h3>
        <p>{confirm.message}</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" disabled={confirmBusy} onClick={() => setConfirm(null)}>Batal</button>
          <button type="button" className={"confirm-ok" + (confirm.danger ? " danger" : "")} disabled={confirmBusy} onClick={handleConfirm}>{confirmBusy ? "Menyimpan…" : confirm.confirmLabel}</button>
        </div>
      </section>
    </div>}

    {pinModal && <div className="modal-layer" onMouseDown={() => !pinJustSet && !bioBusy && setPinModal(null)}>
      <form className="modal" onSubmit={submitPin} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="close" onClick={() => !pinJustSet && !bioBusy && setPinModal(null)}>×</button>
        <p className="eyebrow">{pinModal === "set" ? "KUNCI APLIKASI" : "TERKUNCI"}</p>
        <h2>{pinModal === "set" ? "Buat PIN" : "Masukkan PIN"}</h2>
        <p className="modal-description">{pinModal === "set"
          ? (bioSupported
            ? "PIN 4–6 digit tersimpan di HP ini saja. Setelah PIN dibuat, tempel sidik jari / wajah untuk mengaktifkan biometrik."
            : "PIN 4–6 digit tersimpan di HP ini saja. Perangkat ini tidak mendukung biometrik, jadi buka kunci selalu pakai PIN.")
          : (hasBio ? "Masukkan PIN atau pakai biometrik." : bioSupported ? "Masukkan PIN, atau daftarkan biometrik sekali lalu pakai sidik jari / wajah." : "Masukkan PIN. Perangkat ini tidak mendukung biometrik.")}</p>
        <label>PIN<input inputMode="numeric" type="password" value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••" maxLength={6} required autoFocus /></label>
        <div className="pin-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(k => k === "" ? <span key="e" /> : <button key={k} type="button" onClick={() => setPinInput(p => k === "⌫" ? p.slice(0, -1) : (p + k).slice(0, 6))}>{k}</button>)}
        </div>
        <button className="submit" type="submit" disabled={bioBusy}>{pinModal === "set" ? (pinJustSet || bioBusy ? "Menunggu biometrik…" : "Aktifkan kunci") : "Buka aplikasi"}</button>
        {(pinModal === "set" ? (bioSupported && hasPin && !hasBio) : (bioSupported && hasBio)) && (
          <button type="button" className="goal-cta" disabled={bioBusy} onClick={unlockWithBiometric}>
            {bioBusy ? "Menunggu sensor…" : pinModal === "set" ? "Aktifkan biometrik sekarang" : "Gunakan biometrik"}
          </button>
        )}
        {pinModal === "set" && bioSupported && hasBio && <p className="report-empty" style={{ marginTop: 8 }}>✓ Biometrik aktif di perangkat ini.</p>}
        {pinModal === "unlock" && bioSupported && !hasBio && (
          <button type="button" className="goal-cta" disabled={bioBusy} onClick={registerBiometric}>{bioBusy ? "Menunggu sensor…" : "Daftarkan biometrik"}</button>
        )}
        {pinModal === "unlock" && hasPin && <button type="button" className="export-button" onClick={() => { setPinModal(null); removePin(); }}>Lupa PIN? Matikan kunci</button>}
      </form>
    </div>}

    {locked && !pinModal && <div className="lock-screen">
      <div className="lock-card">
        <img className="brand-mark-img lock-logo" src="/logo.svg" alt="Ruang Saku" width={46} height={46} />
        <h2>Ruang Saku terkunci</h2>
        <p>{hasBio ? "Buka dengan sidik jari / wajah, atau pakai PIN." : bioSupported ? "Buka dengan PIN, atau daftarkan biometrik sekali." : "Nominal disembunyikan. Buka dengan PIN."}</p>
        <div className="lock-actions">
          {hasBio && <button type="button" className="submit" style={{ marginTop: 0 }} disabled={bioBusy} onClick={unlockWithBiometric}>{bioBusy ? "Menunggu sensor…" : "Buka dengan biometrik"}</button>}
          <button type="button" className={hasBio ? "goal-cta" : "submit"} style={hasBio ? undefined : { marginTop: 0 }} onClick={() => { setPinInput(""); setPinModal("unlock"); }}>Buka dengan PIN</button>
        </div>
      </div>
    </div>}

    <div className="toast-stack">
      {toasts.map(t => <div key={t.id} className={"toast " + t.kind}>
        <span className="toast-icon">{t.kind === "success" ? "✓" : t.kind === "warning" ? "◐" : "!"}</span>
        <div><b>{t.title}</b>{t.message && <small>{t.message}</small>}</div>
        <button type="button" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}>×</button>
      </div>)}
    </div>
  </main>;
}
