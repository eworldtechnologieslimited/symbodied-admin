"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Trash2, CheckCircle, RotateCcw, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { naira, pct, formatDate } from "@/lib/utils";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  category: string | null;
  summary: string | null;
  description: string | null;
  target: number;
  raised: number;
  days_left: number;
  status: string;
  created_at: string | null;
  image_url: string | null;
};

type ProjectForm = {
  name: string;
  category: string;
  summary: string;
  description: string;
  target: string;
  days_left: string;
  status: string;
  image_url: string;
};


const CATEGORIES = ["Agriculture", "Medicine", "Technology", "Textile", "Community", "Education", "Other"];
const STATUS_OPTIONS = ["draft", "active", "completed"];
const STATUS_FILTERS = ["all", "active", "draft", "completed"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const emptyForm: ProjectForm = { name: "", category: "Agriculture", summary: "", description: "", target: "", days_left: "30", status: "active", image_url: "" };

const th = "text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-[#668074] border-b border-ink-200 dark:border-[#263a2b] bg-ink-100 dark:bg-[#1b2d20] font-sans";
const td = "px-5 py-4 text-sm text-ink-600 dark:text-[#89a895] border-b border-ink-200 dark:border-[#263a2b] font-sans";
const ta = "w-full rounded-lg border border-ink-200 dark:border-[#263a2b] px-4 py-3 font-sans text-sm text-ink dark:text-[#dceee3] bg-white dark:bg-[#1b2d20] resize-none focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 placeholder:text-ink-400 dark:placeholder:text-[#4d6356]";
const sel = "w-full h-11 rounded-lg border border-ink-200 dark:border-[#263a2b] px-4 font-sans text-sm text-ink dark:text-[#dceee3] bg-white dark:bg-[#1b2d20] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewProject, setViewProject] = useState<Project | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    const supabase = createClient();
    supabase
      .from("projects")
      .select("id, name, category, summary, description, target, raised, days_left, status, created_at, image_url")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Could not load projects.");
        setProjects((data as Project[]) ?? []);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setImageFile(null); setImagePreview(null); setShowModal(true); };
  const openEdit = (p: Project) => {
    setEditingId(p.id);
    setForm({ name: p.name, category: p.category ?? "Agriculture", summary: p.summary ?? "", description: p.description ?? "", target: String(p.target), days_left: String(p.days_left), status: p.status, image_url: p.image_url ?? "" });
    setImageFile(null);
    setImagePreview(p.image_url ?? null);
    setShowModal(true);
  };

  const f = (k: keyof ProjectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file."); return; }
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Project image must be smaller than 5MB."); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => { setImageFile(null); setImagePreview(null); setForm((prev) => ({ ...prev, image_url: "" })); };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    let image_url = form.image_url || null;
    if (imageFile) {
      setUploadingImage(true);
      const body = new FormData();
      body.append("file", imageFile);
      body.append("folder", "project-images");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      setUploadingImage(false);
      if (!res.ok) { toast.error("Failed to upload project image."); setSaving(false); return; }
      const data = await res.json();
      image_url = data.url;
    }

    const payload = { name: form.name, category: form.category, summary: form.summary || null, description: form.description || null, target: parseFloat(form.target) || 0, days_left: parseInt(form.days_left) || 30, status: form.status, image_url };
    const { error } = editingId
      ? await supabase.from("projects").update(payload).eq("id", editingId)
      : await supabase.from("projects").insert({ ...payload, raised: 0 });
    setSaving(false);
    if (error) { toast.error(`Failed to ${editingId ? "update" : "create"} project.`); return; }
    toast.success(editingId ? "Project updated." : "Project created.");
    setShowModal(false);
    load();
  };

  const handleDelete = async (p: Project) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
    const { error } = await createClient().from("projects").delete().eq("id", p.id);
    if (error) { toast.error("Failed to delete project."); load(); }
    else toast.success("Project deleted.");
  };

  const handleStatusToggle = async (p: Project) => {
    const newStatus = p.status === "active" ? "completed" : "active";
    setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: newStatus } : x)));
    const { error } = await createClient().from("projects").update({ status: newStatus }).eq("id", p.id);
    if (error) { setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: p.status } : x))); toast.error("Failed to update status."); }
    else toast.success(`Project marked as ${newStatus}.`);
  };

  const filtered = statusFilter === "all" ? projects : projects.filter((p) => p.status === statusFilter);
  const totalRaised = projects.reduce((s, p) => s + (p.raised ?? 0), 0);

  const stats = [
    { label: "Total Projects", value: projects.length },
    { label: "Active", value: projects.filter((p) => p.status === "active").length },
    { label: "Completed", value: projects.filter((p) => p.status === "completed").length },
    { label: "Total Raised", value: naira(totalRaised) },
  ];

  return (
    <>
      <div className="p-7 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div />
          <Button variant="primary" size="sm" leadingIcon={<Plus size={15} />} onClick={openCreate}>
            New Project
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} padding="md" className="text-center">
              <div className="font-display font-bold text-3xl text-ink dark:text-[#dceee3] leading-none">{loading ? "—" : s.value}</div>
              <div className="mt-1 text-xs text-ink-500 dark:text-[#668074] font-sans">{s.label}</div>
            </Card>
          ))}
        </div>

        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-200 dark:border-[#263a2b] flex items-center gap-1">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md font-sans transition-colors capitalize ${statusFilter === s ? "bg-brand text-white" : "text-ink-500 dark:text-[#668074] hover:text-ink dark:hover:text-[#dceee3] hover:bg-ink-100 dark:hover:bg-[#1b2d20]"}`}>
                {s}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <p className="px-5 py-10 text-sm text-ink-400 font-sans text-center">Loading projects…</p>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-10 text-sm text-ink-400 font-sans text-center">No projects found. Create your first one.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Project</th>
                    <th className={th}>Category</th>
                    <th className={th}>Target</th>
                    <th className={th}>Raised</th>
                    <th className={th}>Days Left</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const progress = pct(p.raised ?? 0, p.target);
                    return (
                      <tr key={p.id} onClick={() => setViewProject(p)} className="hover:bg-ink-100 dark:hover:bg-[#1b2d20] transition-colors cursor-pointer">
                        <td className={td}>
                          <div className="flex items-center gap-3">
                            {p.image_url ? (
                              <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border border-ink-200 dark:border-[#263a2b] shrink-0" />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-ink-100 dark:bg-[#1b2d20] border border-ink-200 dark:border-[#263a2b] flex items-center justify-center shrink-0">
                                <ImagePlus size={14} className="text-ink-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-ink dark:text-[#dceee3] text-sm max-w-52 line-clamp-1">{p.name}</div>
                              {p.summary && <div className="text-xs text-ink-500 dark:text-[#668074] mt-0.5 max-w-52 line-clamp-1">{p.summary}</div>}
                              <div className="text-xs text-ink-400 dark:text-[#4d6356] mt-0.5">{formatDate(p.created_at, { day: "numeric", month: "short" })}</div>
                            </div>
                          </div>
                        </td>
                        <td className={td}>
                          {p.category ? <Badge tone="brand" size="sm">{p.category}</Badge> : "—"}
                        </td>
                        <td className={`${td} font-semibold text-ink dark:text-[#dceee3]`}>{naira(p.target)}</td>
                        <td className={td}>
                          <span className="font-semibold text-brand dark:text-[#2E9B5A] block">{naira(p.raised ?? 0)}</span>
                          <div className="mt-1 w-24 h-1.5 bg-ink-200 dark:bg-[#263a2b] rounded-full overflow-hidden">
                            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-ink-400 dark:text-[#4d6356]">{progress}%</span>
                        </td>
                        <td className={td}>{p.days_left ?? "—"} days</td>
                        <td className={td}><StatusBadge status={p.status} /></td>
                        <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            {(p.status === "active" || p.status === "completed") && (
                              <button onClick={() => handleStatusToggle(p)} title={p.status === "active" ? "Mark completed" : "Reactivate"}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-500 dark:text-[#668074] hover:bg-ink-100 dark:hover:bg-[#1b2d20] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                                {p.status === "active" ? <CheckCircle size={14} /> : <RotateCcw size={14} />}
                              </button>
                            )}
                            <button onClick={() => openEdit(p)} title="Edit"
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-500 dark:text-[#668074] hover:bg-ink-100 dark:hover:bg-[#1b2d20] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(p)} title="Delete"
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-500 hover:bg-error/10 hover:text-error transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* Project detail modal */}
      {viewProject && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setViewProject(null)}>
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-transparent dark:border-[#263a2b]" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-[#162018] z-10 p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={viewProject.status} />
                {viewProject.category && <Badge tone="brand" size="sm">{viewProject.category}</Badge>}
              </div>
              <button onClick={() => setViewProject(null)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Cover image */}
            {viewProject.image_url && (
              <div className="w-full aspect-video overflow-hidden bg-ink-100 dark:bg-[#1b2d20]">
                <img src={viewProject.image_url} alt={viewProject.name} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Body */}
            <div className="p-5 flex flex-col gap-4">
              <div>
                <h3 className="font-display font-bold text-xl text-ink dark:text-[#dceee3] leading-tight">{viewProject.name}</h3>
                {viewProject.summary && <p className="mt-1.5 text-sm text-ink-500 dark:text-[#668074] font-sans leading-relaxed">{viewProject.summary}</p>}
              </div>

              {/* Funding progress */}
              <div className="rounded-lg bg-ink-50 dark:bg-[#1b2d20] border border-ink-200 dark:border-[#263a2b] p-4 flex flex-col gap-2">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-xs text-ink-500 dark:text-[#668074] font-sans uppercase tracking-wide font-semibold">Raised</div>
                    <div className="font-display font-bold text-2xl text-brand leading-none mt-0.5">{naira(viewProject.raised ?? 0)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink-500 dark:text-[#668074] font-sans uppercase tracking-wide font-semibold">Target</div>
                    <div className="font-display font-bold text-2xl text-ink dark:text-[#dceee3] leading-none mt-0.5">{naira(viewProject.target)}</div>
                  </div>
                </div>
                <div className="h-2 bg-ink-200 dark:bg-[#263a2b] rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.min(pct(viewProject.raised ?? 0, viewProject.target), 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-ink-400 dark:text-[#4d6356] font-sans">
                  <span>{pct(viewProject.raised ?? 0, viewProject.target)}% funded</span>
                  <span>{viewProject.days_left ?? "—"} days remaining</span>
                </div>
              </div>

              {/* Description */}
              {viewProject.description && (
                <div>
                  <div className="text-xs font-semibold text-ink-500 dark:text-[#668074] font-sans uppercase tracking-wide mb-1.5">Description</div>
                  <p className="text-sm text-ink dark:text-[#dceee3] font-sans leading-relaxed whitespace-pre-line">{viewProject.description}</p>
                </div>
              )}

              {/* Meta */}
              <div className="flex flex-col gap-2 pt-1 border-t border-ink-200 dark:border-[#263a2b]">
                {[
                  { label: "Created", value: formatDate(viewProject.created_at) },
                  { label: "Project ID", value: viewProject.id, mono: true },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex justify-between items-center gap-4">
                    <span className="text-xs font-semibold text-ink-500 dark:text-[#668074] font-sans uppercase tracking-wide">{label}</span>
                    <span className={`text-sm text-ink dark:text-[#dceee3] font-sans text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 border-t border-ink-200 dark:border-[#263a2b] pt-4 flex gap-2">
              <Button variant="secondary" size="sm" fullWidth leadingIcon={<Pencil size={14} />} onClick={() => { setViewProject(null); openEdit(viewProject); }}>
                Edit Project
              </Button>
              <Button variant="ghost" size="sm" fullWidth leadingIcon={<Trash2 size={14} />} onClick={() => { setViewProject(null); handleDelete(viewProject); }}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-transparent dark:border-[#263a2b]">
            <div className="sticky top-0 bg-white dark:bg-[#162018] z-10 p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-ink dark:text-[#dceee3]">{editingId ? "Edit Project" : "New Project"}</h3>
              <button onClick={() => setShowModal(false)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Project Image</label>
                <div className="flex items-center gap-4">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Project preview" className="h-20 w-20 rounded-lg object-cover border border-ink-200 dark:border-[#263a2b]" />
                  ) : (
                    <div className="h-20 w-20 rounded-lg bg-ink-100 dark:bg-[#1b2d20] border border-dashed border-ink-200 dark:border-[#263a2b] flex items-center justify-center">
                      <ImagePlus size={20} className="text-ink-400" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                      {imagePreview ? "Change image" : "Upload image"}
                    </Button>
                    {imagePreview && (
                      <button type="button" onClick={removeImage} className="text-xs text-error font-sans text-left hover:underline">
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-500 dark:text-[#668074] font-sans">Shown as the cover image on the public project card. PNG or JPG, up to 5MB.</p>
              </div>
              <Input label="Project Name" value={form.name} onChange={f("name")} required placeholder="e.g. Cassava Processing Hub — Enugu" />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Category</label>
                  <select value={form.category} onChange={f("category")} className={sel}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Status</label>
                  <select value={form.status} onChange={f("status")} className={sel}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Funding Target (₦)" type="number" min="0" step="0.01" value={form.target} onChange={f("target")} required placeholder="0.00" />
                <Input label="Days to Run" type="number" min="1" value={form.days_left} onChange={f("days_left")} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Summary <span className="font-normal text-ink-400 dark:text-[#4d6356]">(shown on card)</span></label>
                <textarea value={form.summary} onChange={f("summary")} placeholder="One or two sentences describing the project…" rows={2} className={ta} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">Full Description</label>
                <textarea value={form.description} onChange={f("description")} placeholder="Detailed project description…" rows={4} className={ta} />
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={saving} disabled={saving} leadingIcon={editingId ? <Pencil size={15} /> : <Plus size={15} />}>
                  {uploadingImage ? "Uploading image…" : editingId ? "Save Changes" : "Create Project"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
