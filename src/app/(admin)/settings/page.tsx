"use client";

import { useEffect, useState } from "react";
import { Save, Lock, ShieldCheck, UserMinus, X, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { createAdminUser } from "@/app/actions/admin";

type Profile = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

type AdminRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  username: string | null;
  status: string;
  created_at: string | null;
};

const emptyPasswordForm = { old_password: "", new_password: "", confirm_password: "" };
const emptyAdminForm = { admin_email: "", admin_password: "" };

function PasswordInput({ label, value, onChange, placeholder, name }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; name?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-ink dark:text-[#dceee3] font-sans">{label}</label>
      <div className="relative">
        <input
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          required
          className="w-full h-11 rounded-lg border border-ink-200 dark:border-[#263a2b] pl-4 pr-11 font-sans text-sm text-ink dark:text-[#dceee3] bg-white dark:bg-[#1b2d20] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 placeholder:text-ink-400 dark:placeholder:text-[#4d6356]"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState<Profile>({ first_name: "", last_name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [savingPassword, setSavingPassword] = useState(false);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const loadAdmins = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, username, status, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: false });
    setAdmins((data as AdminRow[]) ?? []);
    setAdminsLoading(false);
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone")
        .eq("id", user.id)
        .single();
      if (data) {
        setProfile({
          first_name: (data as Profile).first_name ?? "",
          last_name: (data as Profile).last_name ?? "",
          email: (data as Profile).email ?? user.email ?? "",
          phone: (data as Profile).phone ?? "",
        });
      }
      setLoading(false);
    });
    loadAdmins();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone })
      .eq("id", userId);
    setSaving(false);
    if (error) toast.error("Failed to save profile.");
    else toast.success("Profile updated.");
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { old_password, new_password, confirm_password } = passwordForm;
    if (new_password !== confirm_password) { toast.error("New passwords do not match."); return; }
    if (new_password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (old_password === new_password) { toast.error("New password must differ from the current one."); return; }

    setSavingPassword(true);
    const supabase = createClient();

    // Verify old password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: old_password,
    });
    if (signInError) {
      toast.error("Current password is incorrect.");
      setSavingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: new_password });
    setSavingPassword(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed successfully.");
    setPasswordForm(emptyPasswordForm);
    setShowPasswordModal(false);
  };

  const handleCreateAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreatingAdmin(true);
    const result = await createAdminUser(adminForm.admin_email, adminForm.admin_password);
    setCreatingAdmin(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success("Admin account created.");
    setAdminForm(emptyAdminForm);
    setShowAdminModal(false);
    loadAdmins();
  };

  const handleRemoveAdmin = async (admin: AdminRow) => {
    setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: "user" }).eq("id", admin.id);
    if (error) { setAdmins((prev) => [...prev, admin]); toast.error("Failed to remove admin role."); }
    else toast.success("Admin role removed.");
  };

  const handleToggleAdminStatus = async (admin: AdminRow) => {
    const newStatus = admin.status === "suspended" ? "active" : "suspended";
    setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, status: newStatus } : a)));
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ status: newStatus }).eq("id", admin.id);
    if (error) {
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, status: admin.status } : a)));
      toast.error("Failed to update status.");
    } else {
      toast.success(newStatus === "suspended" ? "Admin suspended." : "Admin reactivated.");
    }
  };

  const pw = (k: keyof typeof emptyPasswordForm) => (v: string) =>
    setPasswordForm((prev) => ({ ...prev, [k]: v }));

  const adminDisplayName = (a: AdminRow) =>
    `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.username || a.email || "Admin";

  const displayName = `${profile.first_name} ${profile.last_name}`.trim() || "Admin";

  return (
    <>
      <div className="p-7 flex flex-col gap-6 max-w-2xl">
        {/* Profile */}
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-6">
            <Avatar name={displayName} size="xl" />
            <div>
              <h3 className="font-sans font-bold text-lg text-ink dark:text-[#dceee3]">{displayName}</h3>
              <p className="text-sm text-ink-500 dark:text-[#668074] font-sans">{profile.email}</p>
              <span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-gold-light text-gold-dark text-xs font-semibold border border-gold/30">
                Administrator
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First name" value={profile.first_name} onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))} disabled={loading} />
              <Input label="Last name" value={profile.last_name} onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))} disabled={loading} />
            </div>
            <Input label="Email address" value={profile.email} disabled helper="Email cannot be changed from here." />
            <Input label="Phone number" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+234 800 000 0000" disabled={loading} />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" leadingIcon={<Save size={15} />} loading={saving} disabled={loading}>
                Save Profile
              </Button>
            </div>
          </form>
        </Card>

        {/* Change Password — button only */}
        <Card padding="lg">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-brand-light dark:bg-[#112618] flex items-center justify-center text-brand dark:text-[#2E9B5A]">
                <Lock size={16} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-base text-ink dark:text-[#dceee3]">Change Password</h3>
                <p className="text-xs text-ink-500 dark:text-[#668074] font-sans">Update your admin account password.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" leadingIcon={<Lock size={14} />} onClick={() => { setPasswordForm(emptyPasswordForm); setShowPasswordModal(true); }}>
              Change Password
            </Button>
          </div>
        </Card>

        {/* Create Admin — button only */}
        <Card padding="lg">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gold-light dark:bg-[#2a1e00] flex items-center justify-center text-gold-dark dark:text-[#F5C518]">
                <ShieldCheck size={16} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-base text-ink dark:text-[#dceee3]">Create Admin</h3>
                <p className="text-xs text-ink-500 dark:text-[#668074] font-sans">Add a new administrator account to the panel.</p>
              </div>
            </div>
            <Button variant="gold" size="sm" leadingIcon={<ShieldCheck size={14} />} onClick={() => { setAdminForm(emptyAdminForm); setShowAdminModal(true); }}>
              Create Admin
            </Button>
          </div>
        </Card>

        {/* Manage Admin Roles */}
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-200 dark:border-[#263a2b] flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-ink-100 dark:bg-[#1b2d20] flex items-center justify-center text-ink-500 dark:text-[#668074]">
              <ShieldCheck size={15} />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base text-ink dark:text-[#dceee3]">Admin Roles</h3>
              <p className="text-xs text-ink-500 dark:text-[#668074] font-sans">Manage administrator accounts and access.</p>
            </div>
          </div>
          {adminsLoading ? (
            <p className="px-5 py-8 text-sm text-ink-400 font-sans text-center">Loading admins…</p>
          ) : admins.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-400 font-sans text-center">No admin accounts found.</p>
          ) : (
            <div className="divide-y divide-ink-200 dark:divide-[#263a2b]">
              {admins.map((admin) => (
                <div key={admin.id} className="px-5 py-3 flex items-center gap-3">
                  <Avatar name={adminDisplayName(admin)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-ink dark:text-[#dceee3] font-sans truncate">{adminDisplayName(admin)}</div>
                    <div className="text-xs text-ink-500 dark:text-[#668074] font-sans truncate">{admin.email ?? "—"}</div>
                  </div>
                  <StatusBadge status={admin.status ?? "active"} />
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className={admin.status === "suspended" ? "text-success-green" : "text-ink-500"} onClick={() => handleToggleAdminStatus(admin)}>
                      {admin.status === "suspended" ? "Reactivate" : "Suspend"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-error" onClick={() => handleRemoveAdmin(admin)} title="Remove admin role">
                      <UserMinus size={15} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Change Password modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-sm border border-transparent dark:border-[#263a2b]" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-brand-light dark:bg-[#112618] flex items-center justify-center text-brand dark:text-[#2E9B5A]">
                  <Lock size={15} />
                </div>
                <h3 className="font-sans font-bold text-base text-ink dark:text-[#dceee3]">Change Password</h3>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-5 flex flex-col gap-4">
              <PasswordInput label="Current password" value={passwordForm.old_password} onChange={pw("old_password")} placeholder="Enter your current password" />
              <div className="border-t border-ink-200 dark:border-[#263a2b] pt-4 flex flex-col gap-4">
                <PasswordInput label="New password" value={passwordForm.new_password} onChange={pw("new_password")} placeholder="Min. 8 characters" />
                <PasswordInput label="Confirm new password" value={passwordForm.confirm_password} onChange={pw("confirm_password")} placeholder="Repeat new password" />
              </div>
              <p className="text-xs text-ink-400 dark:text-[#4d6356] font-sans">Use a strong password with at least 8 characters.</p>
              <div className="flex gap-3 justify-end pt-1">
                <Button type="button" variant="ghost" onClick={() => setShowPasswordModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary" leadingIcon={<Lock size={14} />} loading={savingPassword}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Admin modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowAdminModal(false)}>
          <div className="bg-white dark:bg-[#162018] rounded-xl shadow-xl w-full max-w-sm border border-transparent dark:border-[#263a2b]" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-ink-200 dark:border-[#263a2b] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gold-light dark:bg-[#2a1e00] flex items-center justify-center text-gold-dark dark:text-[#F5C518]">
                  <ShieldCheck size={15} />
                </div>
                <h3 className="font-sans font-bold text-base text-ink dark:text-[#dceee3]">Create Admin</h3>
              </div>
              <button onClick={() => setShowAdminModal(false)} className="text-ink-400 dark:text-[#4d6356] hover:text-ink dark:hover:text-[#dceee3] transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="p-5 flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                placeholder="admin@example.com"
                value={adminForm.admin_email}
                onChange={(e) => setAdminForm((f) => ({ ...f, admin_email: e.target.value }))}
                required
              />
              <PasswordInput
                label="Temporary password"
                value={adminForm.admin_password}
                onChange={(v) => setAdminForm((f) => ({ ...f, admin_password: v }))}
                placeholder="Min. 8 characters"
              />
              <p className="text-xs text-ink-400 dark:text-[#4d6356] font-sans">The new admin will be able to change their password after first login.</p>
              <div className="flex gap-3 justify-end pt-1">
                <Button type="button" variant="ghost" onClick={() => setShowAdminModal(false)}>Cancel</Button>
                <Button type="submit" variant="gold" leadingIcon={<ShieldCheck size={14} />} loading={creatingAdmin}>
                  Create Admin
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
