"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Bell, Plus, X, Pencil, Trash2, MapPin, Calendar, Users, ImagePlus } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

type EventRow = {
  id: string;
  name: string;
  theme: string | null;
  venue: string | null;
  location: string | null;
  date: string | null;
  slots: number | null;
  created_at: string | null;
  status: string;
  flyer_url: string | null;
  author: string | null;
};

type EventForm = {
  name: string;
  theme: string;
  venue: string;
  location: string;
  date: string;
  slots: string;
  status: string;
};

const MAX_FLYER_BYTES = 5 * 1024 * 1024;

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_FILTERS: StatusFilter[] = ["all", "pending", "approved", "rejected"];
const STATUS_OPTIONS = ["draft", "pending", "approved", "rejected"];
const emptyForm: EventForm = { name: "", theme: "", venue: "", location: "", date: "", slots: "", status: "approved" };

const th = "text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-[#668074] border-b border-ink-200 dark:border-[#263a2b] bg-ink-100 dark:bg-[#1b2d20] font-sans";
const td = "px-5 py-4 text-sm text-ink-600 dark:text-[#89a895] border-b border-ink-200 dark:border-[#263a2b] font-sans";
const sel = "w-full h-11 rounded-lg border border-ink-200 dark:border-[#263a2b] px-4 font-sans text-sm text-ink dark:text-[#dceee3] bg-white dark:bg-[#1b2d20] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export default function AdminEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type RawEvent = { id: string; name: string; theme: string | null; venue: string | null; location: string | null; date: string | null; slots: number | null; created_at: string | null; status: string; flyer_url: string | null; profiles?: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null };

  const load = () => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("id, name, theme, venue, location, date, slots, created_at, status, flyer_url, profiles(first_name, last_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows(
          (data ?? []).map((e) => {
            const raw = e as unknown as RawEvent;
            const p = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
            return { ...raw, author: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || null : null };
          })
        );
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    createClient().auth.getUser().then(({ data: { user } }) => { if (user) setCurrentUserId(user.id); });
  }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setFlyerFile(null); setFlyerPreview(null); setShowModal(true); };
  const openEdit = (r: EventRow) => {
    setEditingId(r.id);
    setForm({ name: r.name, theme: r.theme ?? "", venue: r.venue ?? "", location: r.location ?? "", date: r.date ? r.date.slice(0, 10) : "", slots: r.slots != null ? String(r.slots) : "", status: r.status });
    setFlyerFile(null);
    setFlyerPreview(r.flyer_url ?? null);
    setShowModal(true);
  };

  const f = (k: keyof EventForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleFlyerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file."); return; }
    if (file.size > MAX_FLYER_BYTES) { toast.error("Flyer image must be smaller than 5MB."); return; }
    setFlyerFile(file);
    setFlyerPreview(URL.createObjectURL(file));
  };

  const removeFlyer = () => { setFlyerFile(null); setFlyerPreview(null); };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    let flyer_url = flyerPreview && !flyerFile ? flyerPreview : null;
    if (flyerFile) {
      setUploadingFlyer(true);
      const body = new FormData();
      body.append("file", flyerFile);
      body.append("folder", "event-flyers");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      setUploadingFlyer(false);
      if (!res.ok) { toast.error("Failed to upload flyer image."); setSaving(false); return; }
      const data = await res.json();
      flyer_url = data.url;
    }

    const payload = { name: form.name, theme: form.theme || null, venue: form.venue || null, location: form.location || null, date: form.date || null, slots: form.slots ? parseInt(form.slots) : null, status: form.status, flyer_url };
    const { error } = editingId
      ? await supabase.from("events").update(payload).eq("id", editingId)
      : await supabase.from("events").insert({ ...payload, user_id: currentUserId });
    setSaving(false);
    if (error) { toast.error(`Failed to ${editingId ? "update" : "create"} event.`); return; }
    toast.success(editingId ? "Event updated." : "Event created.");
    setShowModal(false);
    load();
  };

  const handleDelete = async (r: EventRow) => {
    if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    const { error } = await createClient().from("events").delete().eq("id", r.id);
    if (error) { toast.error("Failed to delete event."); load(); }
    else toast.success("Event deleted.");
  };

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await createClient().from("events").update({ status }).eq("id", id);
    if (error) toast.error("Failed to update event.");
    else toast.success(`Event ${status}.`);
  };

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.location ?? "").toLowerCase().includes(q) || (r.author ?? "").toLowerCase().includes(q);
  });

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-ink-200 dark:border-[#263a2b] px-7 pt-5 bg-white dark:bg-[#162018]">
        <div className="px-4 py-2.5 text-sm font-semibold font-sans text-ink border-b-2 border-brand dark:text-[#dceee3]">
          Manage Events
        </div>
        <Link
          href="/events/rsvps"
          className="px-4 py-2.5 text-sm font-semibold font-sans text-ink-500 hover:text-ink dark:text-[#668074] dark:hover:text-[#dceee3] transition-colors flex items-center gap-1.5"
        >
          <Users size={14} /> RSVPs
        </Link>
      </div>

      <div className="p-7 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          {pending > 0 ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-warning font-sans">
              <Bell size={16} /> {pending} pending review
            </span>
          ) : <div />}
          <Button variant="primary" size="sm" leadingIcon={<Plus size={15} />} onClick={openCreate}>
            Create Event
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATUS_FILTERS.map((s) => (
            <Card key={s} padding="sm" className="text-center cursor-pointer" onClick={() => setStatusFilter(s)}
              style={{ outline: statusFilter === s ? "2px solid #1A6B3C" : undefined }}>
              <div className="font-display font-bold text-2xl text-ink dark:text-[#dceee3] leading-none">
                {loading ? "—" : (s === "all" ? rows.length : rows.filter((r) => r.status === s).length)}
              </div>
              <div className="mt-0.5 text-xs text-ink-500 dark:text-[#668074] font-sans capitalize">{s}</div>
            </Card>
          ))}
        </div>

        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-200 dark:border-[#263a2b] max-w-sm">
            <Input placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} leadingIcon={<Search size={15} />} />
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <p className="px-5 py-10 text-sm text-ink-400 font-sans text-center">Loading events…</p>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-10 text-sm text-ink-400 font-sans text-center">No events found.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Event</th>
                    <th className={th}>Organiser</th>
                    <th className={th}>Date</th>
                    <th className={th}>Location</th>
                    <th className={th}>Slots</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-100 dark:hover:bg-[#1b2d20] transition-colors">
                      <td className={`${td} font-semibold text-ink dark:text-[#dceee3] max-w-52`}>
                        <div className="flex items-center gap-3">
                          {r.flyer_url ? (
                            <img src={r.flyer_url} alt="" className="h-10 w-10 rounded-lg object-cover border border-ink-200 dark:border-[#263a2b] shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-ink-100 dark:bg-[#1b2d20] border border-ink-200 dark:border-[#263a2b] flex items-center justify-center shrink-0">
                              <ImagePlus size={14} className="text-ink-400" />
                            </div>
                          )}
                          <div>
                            <div className="line-clamp-1">{r.name}</div>
                            {r.theme && <Badge tone="neutral" size="sm" className="mt-1">{r.theme}</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className={td}>{r.author ?? "Admin"}</td>
                      <td className={td}>
                        {r.date ? (
                          <span className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-ink-400" />
                            {formatDate(r.date, { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={td}>
                        {r.location ? (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-ink-400" />
                            {r.venue ? `${r.venue}, ` : ""}{r.location}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={td}>{r.slots ?? "—"}</td>
                      <td className={td}><StatusBadge status={r.status} /></td>
                      <td className={`${td} text-right`}>
                        <div className="inline-flex items-center gap-1">
                          {r.status === "pending" && (
                            <>
                              <Button variant="primary" size="sm" onClick={() => setStatus(r.id, "approved")}>Approve</Button>
                              <Button variant="secondary" size="sm" onClick={() => setStatus(r.id, "rejected")}>Reject</Button>
                            </>
                          )}
                          <button onClick={() => openEdit(r)} title="Edit"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-500 dark:text-[#668074] hover:bg-ink-100 dark:hover:bg-[#1b2d20] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(r)} title="Delete"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-500 hover:bg-error/10 hover:text-error transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-transparent dark:border-[#263a2b]">
            <div className="sticky top-0 bg-white dark:bg-[#162018] z-10 p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-ink dark:text-[#dceee3]">{editingId ? "Edit Event" : "Create Event"}</h3>
              <button onClick={() => setShowModal(false)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Event Flyer</label>
                <div className="flex items-center gap-4">
                  {flyerPreview ? (
                    <img src={flyerPreview} alt="Flyer preview" className="h-20 w-20 rounded-lg object-cover border border-ink-200 dark:border-[#263a2b]" />
                  ) : (
                    <div className="h-20 w-20 rounded-lg bg-ink-100 dark:bg-[#1b2d20] border border-dashed border-ink-200 dark:border-[#263a2b] flex items-center justify-center">
                      <ImagePlus size={20} className="text-ink-400" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFlyerChange} />
                    <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                      {flyerPreview ? "Change image" : "Upload image"}
                    </Button>
                    {flyerPreview && (
                      <button type="button" onClick={removeFlyer} className="text-xs text-error font-sans text-left hover:underline">
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-500 dark:text-[#668074] font-sans">Shown as the cover image on the public event card. PNG or JPG, up to 5MB.</p>
              </div>
              <Input label="Event Name" value={form.name} onChange={f("name")} required placeholder="e.g. Community Harvest Festival" />
              <Input label="Theme" value={form.theme} onChange={f("theme")} placeholder="Optional theme or tagline" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Venue" value={form.venue} onChange={f("venue")} placeholder="Hall, address…" />
                <Input label="Location" value={form.location} onChange={f("location")} placeholder="Lagos, Enugu…" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Date" type="date" value={form.date} onChange={f("date")} />
                <Input label="Slots" type="number" min="1" value={form.slots} onChange={f("slots")} placeholder="Max attendees" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Status</label>
                <select value={form.status} onChange={f("status")} className={sel}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={saving} disabled={saving} leadingIcon={editingId ? <Pencil size={15} /> : <Plus size={15} />}>
                  {uploadingFlyer ? "Uploading flyer…" : editingId ? "Save Changes" : "Create Event"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
