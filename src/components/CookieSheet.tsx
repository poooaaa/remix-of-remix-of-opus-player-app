import { useEffect, useState } from "react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;

interface CookieSheetProps {
  open: boolean;
  onClose: () => void;
}

const CookieSheet = ({ open, onClose }: CookieSheetProps) => {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ exists: boolean; updated_at: string | null; length: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setMsg(null);
    supabase.functions.invoke("set-cookie", { body: { action: "status" } })
      .then(({ data }: any) => setStatus(data || null))
      .catch(() => {});
  }, [open]);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("set-cookie", {
        body: { action: "save", value },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || "Gagal");
      setMsg("Cookie tersimpan");
      setValue("");
      const { data: s } = await supabase.functions.invoke("set-cookie", { body: { action: "status" } });
      setStatus(s || null);
      setTimeout(onClose, 800);
    } catch (e: any) {
      setMsg(e?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await supabase.functions.invoke("set-cookie", { body: { action: "clear" } });
      setValue("");
      setMsg("Cookie dihapus");
      setStatus({ exists: false, updated_at: null, length: 0 });
    } catch {
      setMsg("Gagal menghapus");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Kelola Cookie</h3>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Tutup
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground mb-2">
          {status?.exists
            ? `Cookie aktif (${status.length} karakter). Diperbarui: ${status.updated_at ? new Date(status.updated_at).toLocaleString() : "-"}`
            : "Belum ada cookie tersimpan."}
        </p>

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
          }}
          placeholder="Tempel cookie Google AI Studio di sini..."
          rows={6}
          className="w-full text-[11px] bg-secondary/50 border border-border rounded-xl p-3 outline-none text-foreground placeholder-muted-foreground font-mono resize-none"
        />

        {msg && (
          <p className="text-[11px] text-muted-foreground mt-2">{msg}</p>
        )}

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleClear}
            disabled={saving}
            className="flex-1 py-2 text-xs rounded-full bg-secondary text-foreground border border-border disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="flex-1 py-2 text-xs rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieSheet;
