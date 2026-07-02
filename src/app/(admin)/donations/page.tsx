"use client";

import { useEffect, useState } from "react";
import { Search, X, CheckCircle2, XCircle, RotateCcw, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { naira, formatDate } from "@/lib/utils";
import { toast } from "sonner";

type DonationRow = {
  id: string;
  project_id: string | null;
  donor_name: string | null;
  amount: number | null;
  currency: string | null;
  payment_method: string | null;
  reference: string | null;
  status: string;
  created_at: string | null;
  projects: { name: string } | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

type ProjectOption = { id: string; name: string };

const CURRENCIES = ["NGN", "USD", "EUR", "GBP", "CAD", "GHS", "KES"];
const MANUAL_METHODS = ["cash", "cheque", "bank_transfer", "other"];
const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦", USD: "$", EUR: "€", GBP: "£", CAD: "CA$", GHS: "GH₵", KES: "KSh",
};

const th = "text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-[#668074] border-b border-ink-200 dark:border-[#263a2b] bg-ink-100 dark:bg-[#1b2d20] font-sans";
const td = "px-5 py-4 text-sm text-ink-600 dark:text-[#89a895] border-b border-ink-200 dark:border-[#263a2b] font-sans";
const sel = "w-full h-11 rounded-lg border border-ink-200 dark:border-[#263a2b] px-4 font-sans text-sm text-ink dark:text-[#dceee3] bg-white dark:bg-[#1b2d20] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

const emptyForm = { project_id: "", donor_name: "", amount: "", currency: "NGN", payment_method: "cash", reference: "" };

export default function AdminDonationsPage() {
  const [rows, setRows] = useState<DonationRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DonationRow | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    const supabase = createClient();
    supabase
      .from("donations")
      .select("id, project_id, donor_name, amount, currency, payment_method, reference, status, created_at, projects(name), profiles(first_name, last_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data as DonationRow[]) ?? []);
        setLoading(false);
      });
    supabase
      .from("projects")
      .select("id, name")
      .in("status", ["active", "completed"])
      .order("name")
      .then(({ data }) => {
        const seen = new Set<string>();
        const unique = ((data as ProjectOption[]) ?? []).filter(p => !seen.has(p.id) && seen.add(p.id));
        setProjects(unique);
      });
  };

  useEffect(() => { load(); }, []);

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_id) { toast.error("Select a project."); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount."); return; }
    if (!form.donor_name.trim()) { toast.error("Enter a donor name."); return; }

    setSaving(true);
    const supabase = createClient();

    const { data: donation, error } = await supabase
      .from("donations")
      .insert({
        project_id: form.project_id,
        donor_name: form.donor_name.trim(),
        amount,
        currency: form.currency,
        payment_method: form.payment_method,
        reference: form.reference.trim() || null,
        status: "completed",
      })
      .select("id")
      .single();

    if (error || !donation) {
      toast.error("Failed to create donation.");
      setSaving(false);
      return;
    }

    // Increment project raised amount
    const { data: proj } = await supabase
      .from("projects")
      .select("raised")
      .eq("id", form.project_id)
      .maybeSingle();
    if (proj) {
      await supabase
        .from("projects")
        .update({ raised: Number(proj.raised ?? 0) + amount })
        .eq("id", form.project_id);
    }

    toast.success("Donation recorded and project raised amount updated.");
    setSaving(false);
    setShowCreate(false);
    setForm(emptyForm);
    load();
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const projectName = r.projects?.name ?? "";
    const donorName = r.donor_name || [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ");
    return (
      projectName.toLowerCase().includes(q) ||
      donorName.toLowerCase().includes(q) ||
      (r.reference ?? "").toLowerCase().includes(q)
    );
  });

  const totalAmount = rows.filter(r => r.status === "completed").reduce((s, r) => s + ((r.amount as number) ?? 0), 0);

  const stats = [
    { label: "Total Donations", value: rows.length },
    { label: "Total Raised", value: totalAmount > 0 ? naira(totalAmount) : "—" },
    { label: "Completed", value: rows.filter((r) => r.status === "completed").length },
    { label: "Pending", value: rows.filter((r) => r.status === "pending").length },
  ];

  const updateStatus = async (newStatus: "completed" | "failed" | "pending") => {
    if (!selected) return;
    setUpdatingStatus(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("donations")
      .update({
        status: newStatus,
        ...(newStatus === "completed" && !selected.reference ? { reference: "manual_confirmed" } : {}),
      })
      .eq("id", selected.id);

    if (error) { toast.error("Failed to update donation status."); setUpdatingStatus(false); return; }

    if (newStatus === "completed" && selected.project_id && selected.amount) {
      const { data: proj } = await supabase.from("projects").select("raised").eq("id", selected.project_id).maybeSingle();
      if (proj) {
        await supabase
          .from("projects")
          .update({ raised: Number(proj.raised ?? 0) + Number(selected.amount) })
          .eq("id", selected.project_id);
      }
    }

    const updated = { ...selected, status: newStatus };
    setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus } : r)));
    setSelected(updated);
    toast.success(`Donation marked as ${newStatus}.`);
    setUpdatingStatus(false);
  };

  return (
    <>
      <div className="p-7 flex flex-col gap-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} padding="md" className="text-center">
              <div className="font-display font-bold text-2xl text-ink dark:text-[#dceee3] leading-none">{loading ? "—" : s.value}</div>
              <div className="mt-1 text-xs text-ink-500 dark:text-[#668074] font-sans">{s.label}</div>
            </Card>
          ))}
        </div>

        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-200 dark:border-[#263a2b] flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <Input
                placeholder="Search by project, donor or reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leadingIcon={<Search size={15} />}
              />
            </div>
            <Button variant="primary" size="sm" leadingIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              Create Donation
            </Button>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <p className="px-5 py-10 text-sm text-ink-400 font-sans text-center">Loading donations…</p>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-10 text-sm text-ink-400 font-sans text-center">No donations found.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Project</th>
                    <th className={th}>Donor</th>
                    <th className={th}>Amount</th>
                    <th className={th}>Currency</th>
                    <th className={th}>Method</th>
                    <th className={th}>Date</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const donorName = r.donor_name || [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr key={r.id} onClick={() => setSelected(r)} className="hover:bg-ink-100 dark:hover:bg-[#1b2d20] transition-colors cursor-pointer">
                        <td className={`${td} font-semibold text-ink dark:text-[#dceee3] max-w-48`}>
                          <span className="line-clamp-2">{r.projects?.name ?? "—"}</span>
                        </td>
                        <td className={td}>{donorName}</td>
                        <td className={`${td} font-semibold text-brand`}>{r.amount != null ? naira(r.amount) : "—"}</td>
                        <td className={td}>{r.currency ?? "NGN"}</td>
                        <td className={td}>
                          {r.payment_method ? <span className="capitalize">{r.payment_method.replace("_", " ")}</span> : "—"}
                        </td>
                        <td className={td}>{formatDate(r.created_at)}</td>
                        <td className={td}><StatusBadge status={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* Donation detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-md border border-transparent dark:border-[#263a2b]" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-ink-400 dark:text-[#4d6356] font-sans font-mono">#{selected.id.slice(0, 12)}…</p>
                <h3 className="font-display font-bold text-lg text-ink dark:text-[#dceee3] leading-tight mt-0.5">
                  {selected.projects?.name ?? "Donation"}
                </h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors flex-shrink-0">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3">
              {[
                { label: "Donor",     value: selected.donor_name || [selected.profiles?.first_name, selected.profiles?.last_name].filter(Boolean).join(" ") || "—" },
                { label: "Amount",    value: selected.amount != null ? `${CURRENCY_SYMBOLS[selected.currency ?? ""] ?? ""}${Number(selected.amount).toLocaleString()}` : "—" },
                { label: "Currency",  value: selected.currency ?? "NGN" },
                { label: "Method",    value: selected.payment_method?.replace("_", " ") ?? "—", capitalize: true },
                { label: "Reference", value: selected.reference ?? "—", mono: true },
                { label: "Date",      value: formatDate(selected.created_at) },
              ].map(({ label, value, capitalize, mono }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold text-ink-500 dark:text-[#668074] font-sans uppercase tracking-wide">{label}</span>
                  <span className={`text-sm text-ink dark:text-[#dceee3] font-sans text-right ${capitalize ? "capitalize" : ""} ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-ink-500 dark:text-[#668074] font-sans uppercase tracking-wide">Status</span>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div className="px-5 pb-5">
              {selected.status !== "completed" ? (
                <div className="border-t border-ink-200 dark:border-[#263a2b] pt-4 flex gap-2">
                  {selected.status === "pending" && (
                    <>
                      <Button variant="primary" size="sm" fullWidth loading={updatingStatus} onClick={() => updateStatus("completed")} leadingIcon={<CheckCircle2 size={14} />}>
                        Mark Completed
                      </Button>
                      <Button variant="ghost" size="sm" fullWidth loading={updatingStatus} onClick={() => updateStatus("failed")} leadingIcon={<XCircle size={14} />}>
                        Mark Failed
                      </Button>
                    </>
                  )}
                  {selected.status === "failed" && (
                    <Button variant="secondary" size="sm" fullWidth loading={updatingStatus} onClick={() => updateStatus("pending")} leadingIcon={<RotateCcw size={14} />}>
                      Revert to Pending
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-400 dark:text-[#4d6356] font-sans text-center pt-4 border-t border-ink-200 dark:border-[#263a2b]">
                  This donation is confirmed. No further actions needed.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Donation modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-md border border-transparent dark:border-[#263a2b]" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-ink dark:text-[#dceee3]">Record Donation</h3>
              <button onClick={() => setShowCreate(false)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Project</label>
                <select value={form.project_id} onChange={f("project_id")} className={sel} required>
                  <option value="">Select a project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <Input label="Donor Name" value={form.donor_name} onChange={f("donor_name")} placeholder="e.g. Emeka Okafor" required />

              <div className="grid grid-cols-2 gap-4">
                <Input label="Amount" type="number" min="1" step="0.01" value={form.amount} onChange={f("amount")} placeholder="0.00" required />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Currency</label>
                  <select value={form.currency} onChange={f("currency")} className={sel}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Payment Method</label>
                <select value={form.payment_method} onChange={f("payment_method")} className={sel}>
                  {MANUAL_METHODS.map((m) => <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>

              <Input label="Reference / Notes" value={form.reference} onChange={f("reference")} placeholder="Cheque no., envelope ref, fundraiser name…" />

              <p className="text-xs text-ink-400 dark:text-[#4d6356] font-sans">
                This will be recorded as <strong>Completed</strong> and immediately added to the project&apos;s raised amount.
              </p>

              <div className="flex gap-3 justify-end pt-1">
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={saving} leadingIcon={<Plus size={14} />}>Record Donation</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
