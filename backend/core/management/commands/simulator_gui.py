"""
simulator_gui
=============
Django management command that launches a Tkinter-based GUI control panel
for the TRACE-MES machine simulator.

Usage
-----
    python manage.py simulator_gui

The GUI provides:
- Machine list with real-time status, progress bars, and telemetry
- Add / remove machine dialogs
- Start / pause / resume / stop program controls
- Event log panel
- Simulation speed indicator (1 real min = 3 simulated min by default)
"""

import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog

from django.core.management.base import BaseCommand

from core.simulator.machine_simulator import MachineSimulator, TIME_SCALE_FACTOR
from core.simulator.telemetry_profiles import MACHINE_TYPE_CHOICES


class Command(BaseCommand):
    help = "Launch the TRACE-MES Simulator GUI (Tkinter-based control panel)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=float,
            default=1.0,
            help="Seconds between simulation ticks (default: 1.0).",
        )

    def handle(self, *args, **options):
        interval = max(0.1, options["interval"])
        self.stdout.write(self.style.SUCCESS(
            f"\n[SimulatorGUI] Starting Tkinter GUI (tick interval={interval}s, "
            f"time scale={TIME_SCALE_FACTOR}x)...\n"
        ))
        app = SimulatorGUI(interval=interval)
        app.run()


# ---------------------------------------------------------------------------
# Add Machine Dialog
# ---------------------------------------------------------------------------

class AddMachineDialog(tk.Toplevel):
    """Modal dialog for adding a new machine."""

    def __init__(self, parent, machine_types):
        super().__init__(parent)
        self.title("Makine Ekle")
        self.geometry("400x250")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.result = None

        # Configure style
        self.configure(bg="#1e1e2e")

        # Name
        tk.Label(self, text="Makine Adı:", bg="#1e1e2e", fg="#cdd6f4",
                 font=("Segoe UI", 10)).pack(anchor="w", padx=20, pady=(15, 2))
        self.name_var = tk.StringVar()
        name_entry = tk.Entry(self, textvariable=self.name_var, font=("Segoe UI", 10),
                              bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
                              relief="flat", bd=5)
        name_entry.pack(fill="x", padx=20)
        name_entry.focus_set()

        # Type
        tk.Label(self, text="Makine Tipi:", bg="#1e1e2e", fg="#cdd6f4",
                 font=("Segoe UI", 10)).pack(anchor="w", padx=20, pady=(10, 2))
        self.type_var = tk.StringVar()
        type_combo = ttk.Combobox(self, textvariable=self.type_var,
                                  values=[f"{code} — {label}" for code, label in machine_types],
                                  state="readonly", font=("Segoe UI", 10))
        type_combo.pack(fill="x", padx=20)
        type_combo.current(0)

        # Buttons
        btn_frame = tk.Frame(self, bg="#1e1e2e")
        btn_frame.pack(fill="x", padx=20, pady=20)

        tk.Button(btn_frame, text="✓ Ekle", command=self._on_add,
                  bg="#a6e3a1", fg="#1e1e2e", font=("Segoe UI", 10, "bold"),
                  relief="flat", padx=15, pady=5, cursor="hand2").pack(side="left")
        tk.Button(btn_frame, text="✕ İptal", command=self.destroy,
                  bg="#f38ba8", fg="#1e1e2e", font=("Segoe UI", 10, "bold"),
                  relief="flat", padx=15, pady=5, cursor="hand2").pack(side="right")

    def _on_add(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("Uyarı", "Makine adı boş olamaz.", parent=self)
            return
        type_val = self.type_var.get().split(" — ")[0]
        self.result = {"name": name, "type": type_val}
        self.destroy()


# ---------------------------------------------------------------------------
# Start Program Dialog
# ---------------------------------------------------------------------------

class StartProgramDialog(tk.Toplevel):
    """Modal dialog for starting a program on a machine."""

    def __init__(self, parent, machine_name):
        super().__init__(parent)
        self.title(f"Program Başlat — {machine_name}")
        self.geometry("420x300")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.result = None
        self.configure(bg="#1e1e2e")

        # Program name
        tk.Label(self, text="Program Adı:", bg="#1e1e2e", fg="#cdd6f4",
                 font=("Segoe UI", 10)).pack(anchor="w", padx=20, pady=(15, 2))
        self.prog_var = tk.StringVar(value=f"{machine_name} Program")
        tk.Entry(self, textvariable=self.prog_var, font=("Segoe UI", 10),
                 bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
                 relief="flat", bd=5).pack(fill="x", padx=20)

        # Duration
        tk.Label(self, text="Süre (simülasyon dakikası):", bg="#1e1e2e", fg="#cdd6f4",
                 font=("Segoe UI", 10)).pack(anchor="w", padx=20, pady=(10, 2))
        self.dur_var = tk.StringVar(value="15")
        tk.Entry(self, textvariable=self.dur_var, font=("Segoe UI", 10),
                 bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
                 relief="flat", bd=5).pack(fill="x", padx=20)

        # Target qty
        tk.Label(self, text="Hedef Parça Sayısı:", bg="#1e1e2e", fg="#cdd6f4",
                 font=("Segoe UI", 10)).pack(anchor="w", padx=20, pady=(10, 2))
        self.qty_var = tk.StringVar(value="100")
        tk.Entry(self, textvariable=self.qty_var, font=("Segoe UI", 10),
                 bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
                 relief="flat", bd=5).pack(fill="x", padx=20)

        # Info label about time scale
        real_sec = (15 * 60) / TIME_SCALE_FACTOR
        tk.Label(self, text=f"ℹ 1 gerçek dk = {TIME_SCALE_FACTOR:.0f} simülasyon dk  |  "
                            f"15 sim.dk = {real_sec:.0f} gerçek sn",
                 bg="#1e1e2e", fg="#6c7086", font=("Segoe UI", 8)).pack(anchor="w", padx=20, pady=(8, 0))

        # Buttons
        btn_frame = tk.Frame(self, bg="#1e1e2e")
        btn_frame.pack(fill="x", padx=20, pady=15)

        tk.Button(btn_frame, text="▶ Başlat", command=self._on_start,
                  bg="#a6e3a1", fg="#1e1e2e", font=("Segoe UI", 10, "bold"),
                  relief="flat", padx=15, pady=5, cursor="hand2").pack(side="left")
        tk.Button(btn_frame, text="✕ İptal", command=self.destroy,
                  bg="#f38ba8", fg="#1e1e2e", font=("Segoe UI", 10, "bold"),
                  relief="flat", padx=15, pady=5, cursor="hand2").pack(side="right")

    def _on_start(self):
        try:
            duration = float(self.dur_var.get())
            qty = int(self.qty_var.get())
        except ValueError:
            messagebox.showwarning("Uyarı", "Süre ve parça sayısı sayısal olmalıdır.", parent=self)
            return
        if duration <= 0 or qty <= 0:
            messagebox.showwarning("Uyarı", "Süre ve parça sayısı pozitif olmalıdır.", parent=self)
            return
        self.result = {
            "program_name": self.prog_var.get().strip(),
            "duration_minutes": duration,
            "target_qty": qty,
        }
        self.destroy()


# ---------------------------------------------------------------------------
# Main GUI Application
# ---------------------------------------------------------------------------

class SimulatorGUI:
    """Tkinter-based simulator control panel."""

    def __init__(self, interval: float = 1.0):
        self.interval = interval
        self.simulator = MachineSimulator()
        self._running = True
        self._selected_machine_id = None

        # Create root window
        self.root = tk.Tk()
        self.root.title("🏭 TRACE-MES Makine Simülatörü")
        self.root.geometry("1100x780")
        self.root.configure(bg="#1e1e2e")
        self.root.minsize(900, 600)

        # Try to set dark title bar on Windows
        try:
            self.root.wm_attributes("-alpha", 0.98)
        except tk.TclError:
            pass

        self._build_ui()
        self._start_simulation_thread()

    def run(self):
        """Start the Tkinter main loop."""
        self._schedule_update()
        try:
            self.root.mainloop()
        finally:
            self._running = False

    # ------------------------------------------------------------------
    # UI Construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")

        # Configure ttk styles
        style.configure("Dark.TFrame", background="#1e1e2e")
        style.configure("Dark.TLabel", background="#1e1e2e", foreground="#cdd6f4",
                         font=("Segoe UI", 10))
        style.configure("Header.TLabel", background="#1e1e2e", foreground="#89b4fa",
                         font=("Segoe UI", 14, "bold"))
        style.configure("Status.TLabel", background="#1e1e2e", foreground="#a6adc8",
                         font=("Segoe UI", 9))
        style.configure("Treeview", background="#313244", foreground="#cdd6f4",
                         fieldbackground="#313244", font=("Segoe UI", 9),
                         rowheight=28)
        style.configure("Treeview.Heading", background="#45475a", foreground="#cdd6f4",
                         font=("Segoe UI", 9, "bold"))
        style.map("Treeview", background=[("selected", "#585b70")])

        # Header
        header = ttk.Frame(self.root, style="Dark.TFrame")
        header.pack(fill="x", padx=15, pady=(10, 5))

        ttk.Label(header, text="🏭 TRACE-MES Makine Simülatörü",
                  style="Header.TLabel").pack(side="left")

        # Time scale indicator
        ttk.Label(header,
                  text=f"⏱ Hız: 1 dk = {TIME_SCALE_FACTOR:.0f} sim.dk",
                  style="Status.TLabel").pack(side="right", padx=10)

        # Status indicator
        self.status_label = ttk.Label(header, text="▶ Simülasyon Çalışıyor",
                                       style="Status.TLabel")
        self.status_label.pack(side="right", padx=10)

        # Toolbar
        toolbar = tk.Frame(self.root, bg="#1e1e2e")
        toolbar.pack(fill="x", padx=15, pady=5)

        self._make_button(toolbar, "➕ Makine Ekle", self._on_add_machine,
                          bg="#a6e3a1").pack(side="left", padx=3)
        self._make_button(toolbar, "🗑 Makineyi Sil", self._on_remove_machine,
                          bg="#f38ba8").pack(side="left", padx=3)

        ttk.Separator(toolbar, orient="vertical").pack(side="left", fill="y", padx=10, pady=2)

        self._make_button(toolbar, "▶ Program Başlat", self._on_start_program,
                          bg="#89b4fa").pack(side="left", padx=3)
        self._make_button(toolbar, "⏸ Durakla", self._on_pause,
                          bg="#fab387").pack(side="left", padx=3)
        self._make_button(toolbar, "▶ Devam", self._on_resume,
                          bg="#94e2d5").pack(side="left", padx=3)
        self._make_button(toolbar, "⏹ Durdur", self._on_stop,
                          bg="#f38ba8").pack(side="left", padx=3)

        # Main content — paned window
        paned = ttk.PanedWindow(self.root, orient="vertical")
        paned.pack(fill="both", expand=True, padx=15, pady=5)

        # -- Top pane: Machine list --
        top_frame = tk.Frame(paned, bg="#181825")
        paned.add(top_frame, weight=3)

        tk.Label(top_frame, text="📋 Makine Listesi", bg="#181825", fg="#89b4fa",
                 font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=10, pady=(5, 2))

        tree_frame = tk.Frame(top_frame, bg="#181825")
        tree_frame.pack(fill="both", expand=True, padx=5, pady=5)

        columns = ("name", "type", "status", "wo_code", "progress", "remaining",
                    "rpm", "temp", "vibration")
        self.machine_tree = ttk.Treeview(tree_frame, columns=columns,
                                          show="headings", selectmode="browse")

        col_widths = {
            "name": 180, "type": 90, "status": 80, "wo_code": 130,
            "progress": 80, "remaining": 90, "rpm": 90, "temp": 70, "vibration": 80,
        }
        col_headers = {
            "name": "Makine", "type": "Tip", "status": "Durum", "wo_code": "İş Emri",
            "progress": "İlerleme", "remaining": "Kalan", "rpm": "Devir/Hız",
            "temp": "Sıcaklık", "vibration": "Titreşim",
        }

        for col in columns:
            self.machine_tree.heading(col, text=col_headers[col])
            self.machine_tree.column(col, width=col_widths[col], anchor="center")

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical",
                                   command=self.machine_tree.yview)
        self.machine_tree.configure(yscrollcommand=scrollbar.set)
        self.machine_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.machine_tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # -- Bottom pane: split into detail and event log --
        bottom_paned = ttk.PanedWindow(paned, orient="horizontal")
        paned.add(bottom_paned, weight=2)

        # Detail panel
        detail_frame = tk.Frame(bottom_paned, bg="#181825")
        bottom_paned.add(detail_frame, weight=1)

        tk.Label(detail_frame, text="📊 Seçili Makine Detay", bg="#181825", fg="#89b4fa",
                 font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=10, pady=(5, 2))

        self.detail_text = tk.Text(detail_frame, bg="#313244", fg="#cdd6f4",
                                    font=("Consolas", 10), relief="flat",
                                    state="disabled", wrap="word", padx=10, pady=10)
        self.detail_text.pack(fill="both", expand=True, padx=5, pady=5)

        # Event log panel
        event_frame = tk.Frame(bottom_paned, bg="#181825")
        bottom_paned.add(event_frame, weight=1)

        tk.Label(event_frame, text="📜 Olay Günlüğü", bg="#181825", fg="#89b4fa",
                 font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=10, pady=(5, 2))

        self.event_text = tk.Text(event_frame, bg="#313244", fg="#cdd6f4",
                                   font=("Consolas", 9), relief="flat",
                                   state="disabled", wrap="word", padx=10, pady=10)
        self.event_text.pack(fill="both", expand=True, padx=5, pady=5)

        # Footer
        footer = tk.Frame(self.root, bg="#1e1e2e")
        footer.pack(fill="x", padx=15, pady=(0, 5))

        self.tick_label = ttk.Label(footer, text="Tick: 0", style="Status.TLabel")
        self.tick_label.pack(side="left")

        self.machine_count_label = ttk.Label(footer, text="Makineler: 0",
                                              style="Status.TLabel")
        self.machine_count_label.pack(side="right")

    def _make_button(self, parent, text, command, bg="#89b4fa"):
        """Create a styled button."""
        return tk.Button(parent, text=text, command=command,
                         bg=bg, fg="#1e1e2e",
                         font=("Segoe UI", 9, "bold"),
                         relief="flat", padx=10, pady=4, cursor="hand2",
                         activebackground=bg, activeforeground="#1e1e2e")

    # ------------------------------------------------------------------
    # Simulation Thread
    # ------------------------------------------------------------------

    def _start_simulation_thread(self):
        """Start the background thread that calls simulator.tick() every interval."""
        def _tick_loop():
            while self._running:
                try:
                    self.simulator.tick()
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                time.sleep(self.interval)

        thread = threading.Thread(target=_tick_loop, daemon=True, name="SimulatorTick")
        thread.start()

    # ------------------------------------------------------------------
    # UI Update (runs on main thread via Tk.after)
    # ------------------------------------------------------------------

    def _schedule_update(self):
        """Schedule the next UI update."""
        if not self._running:
            return
        try:
            self._update_ui()
        except Exception:
            import traceback
            traceback.print_exc()
        self.root.after(1000, self._schedule_update)  # Update UI every 1 second

    def _update_ui(self):
        """Refresh all UI elements with current simulation data."""
        machines = self.simulator.get_all_machines()
        events = self.simulator.get_event_log(limit=30)

        # Update machine tree
        # Remember selection
        sel = self.machine_tree.selection()
        selected_id = None
        if sel:
            item = sel[0]
            # item iid is the machine id
            selected_id = item

        # Clear and repopulate
        self.machine_tree.delete(*self.machine_tree.get_children())

        for m in machines:
            status_icon = {
                "RUNNING": "🟢", "IDLE": "⚪", "DOWN": "🔴",
                "OFFLINE": "⚫", "PAUSED": "🟡"
            }.get(m["status"], "❓")

            # Progress string
            progress = f"{m['progress_pct']:.0f}%" if m["progress_pct"] > 0 else "—"

            # Remaining time
            remaining = "—"
            if m["remaining_sec"] is not None:
                mins, secs = divmod(m["remaining_sec"], 60)
                remaining = f"{mins:.0f}dk {secs:.0f}sn"

            # Telemetry
            t = m.get("telemetry") or {}
            rpm = f"{t.get('spindle_speed', 0):.0f}" if t else "—"
            temp = f"{t.get('temperature', 0):.1f}°C" if t else "—"
            vib = f"{t.get('vibration', 0):.4f}" if t else "—"

            display_status = m.get("exec_status") or m["status"]

            self.machine_tree.insert("", "end", iid=m["id"], values=(
                f"{status_icon} {m['name']}",
                m["type"],
                display_status,
                m.get("wo_code") or "—",
                progress,
                remaining,
                rpm,
                temp,
                vib,
            ))

        # Restore selection
        if selected_id and self.machine_tree.exists(selected_id):
            self.machine_tree.selection_set(selected_id)
            self._update_detail_panel(selected_id, machines)
        elif self._selected_machine_id:
            matching = [m for m in machines if m["id"] == self._selected_machine_id]
            if matching:
                self.machine_tree.selection_set(self._selected_machine_id)
                self._update_detail_panel(self._selected_machine_id, machines)

        # Update event log
        self.event_text.configure(state="normal")
        self.event_text.delete("1.0", "end")
        for evt in reversed(events):
            self.event_text.insert("end", f"[{evt['timestamp']}]  {evt['message']}\n")
        self.event_text.configure(state="disabled")

        # Update footer
        self.tick_label.configure(text=f"Tick: {self.simulator._tick}")
        running_count = sum(1 for m in machines if m["status"] == "RUNNING")
        self.machine_count_label.configure(
            text=f"Toplam: {len(machines)}  |  Çalışan: {running_count}"
        )

    def _update_detail_panel(self, machine_id: str, machines: list):
        """Update the detail text panel for the selected machine."""
        m = next((x for x in machines if x["id"] == machine_id), None)
        if not m:
            return

        t = m.get("telemetry") or {}

        lines = [
            f"  Makine:   {m['name']}",
            f"  Tip:      {m['type']}",
            f"  Slug:     {m['slug']}",
            f"  Durum:    {m['status']}",
            f"  İş Emri:  {m.get('wo_code') or '—'}",
            f"  Exec ID:  {m.get('exec_id') or '—'}",
            "",
            f"  ── Telemetri ──────────────────",
            f"  Devir/Hız:  {t.get('spindle_speed', 0):.2f}",
            f"  İlerleme:   {t.get('feed_rate', 0):.2f}",
            f"  Sıcaklık:   {t.get('temperature', 0):.2f} °C",
            f"  Titreşim:   {t.get('vibration', 0):.4f}",
            "",
            f"  ── Üretim ─────────────────────",
            f"  İlerleme:   {m['progress_pct']:.1f}%",
        ]

        if m["remaining_sec"] is not None:
            mins, secs = divmod(m["remaining_sec"], 60)
            lines.append(f"  Kalan:      {mins:.0f} dk {secs:.0f} sn")
        else:
            lines.append(f"  Kalan:      —")

        self.detail_text.configure(state="normal")
        self.detail_text.delete("1.0", "end")
        self.detail_text.insert("1.0", "\n".join(lines))
        self.detail_text.configure(state="disabled")

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def _on_tree_select(self, event):
        sel = self.machine_tree.selection()
        if sel:
            self._selected_machine_id = sel[0]

    def _on_add_machine(self):
        dialog = AddMachineDialog(self.root, MACHINE_TYPE_CHOICES)
        self.root.wait_window(dialog)
        if dialog.result:
            try:
                self.simulator.add_machine(
                    name=dialog.result["name"],
                    machine_type=dialog.result["type"],
                )
            except Exception as e:
                messagebox.showerror("Hata", f"Makine eklenemedi: {e}")

    def _on_remove_machine(self):
        if not self._selected_machine_id:
            messagebox.showinfo("Bilgi", "Lütfen önce bir makine seçin.")
            return
        if messagebox.askyesno("Onay", "Seçili makineyi kaldırmak istediğinize emin misiniz?"):
            success = self.simulator.remove_machine(self._selected_machine_id)
            if not success:
                messagebox.showerror("Hata", "Makine bulunamadı.")
            else:
                self._selected_machine_id = None

    def _on_start_program(self):
        if not self._selected_machine_id:
            messagebox.showinfo("Bilgi", "Lütfen önce bir makine seçin.")
            return

        # Get machine name for the dialog title
        machines = self.simulator.get_all_machines()
        m = next((x for x in machines if x["id"] == self._selected_machine_id), None)
        if not m:
            return
        if m["status"] == "RUNNING":
            messagebox.showwarning("Uyarı", "Bu makine zaten çalışıyor.")
            return
        if m["status"] == "OFFLINE":
            messagebox.showwarning("Uyarı", "Bu makine çevrimdışı.")
            return

        dialog = StartProgramDialog(self.root, m["name"])
        self.root.wait_window(dialog)
        if dialog.result:
            execution = self.simulator.start_program(
                machine_id=self._selected_machine_id,
                program_name=dialog.result["program_name"],
                duration_minutes=dialog.result["duration_minutes"],
                target_qty=dialog.result["target_qty"],
            )
            if not execution:
                messagebox.showerror("Hata", "Program başlatılamadı.")

    def _on_pause(self):
        if not self._selected_machine_id:
            messagebox.showinfo("Bilgi", "Lütfen önce bir makine seçin.")
            return
        machines = self.simulator.get_all_machines()
        m = next((x for x in machines if x["id"] == self._selected_machine_id), None)
        if not m or not m.get("exec_id"):
            messagebox.showinfo("Bilgi", "Bu makinede aktif bir program yok.")
            return
        success = self.simulator.pause_program(m["exec_id"])
        if not success:
            messagebox.showwarning("Uyarı", "Duraklatma başarısız.")

    def _on_resume(self):
        if not self._selected_machine_id:
            messagebox.showinfo("Bilgi", "Lütfen önce bir makine seçin.")
            return
        machines = self.simulator.get_all_machines()
        m = next((x for x in machines if x["id"] == self._selected_machine_id), None)
        if not m or not m.get("exec_id"):
            messagebox.showinfo("Bilgi", "Bu makinede aktif bir program yok.")
            return
        success = self.simulator.resume_program(m["exec_id"])
        if not success:
            messagebox.showwarning("Uyarı", "Devam ettirme başarısız.")

    def _on_stop(self):
        if not self._selected_machine_id:
            messagebox.showinfo("Bilgi", "Lütfen önce bir makine seçin.")
            return
        machines = self.simulator.get_all_machines()
        m = next((x for x in machines if x["id"] == self._selected_machine_id), None)
        if not m or not m.get("exec_id"):
            messagebox.showinfo("Bilgi", "Bu makinede aktif bir program yok.")
            return
        if messagebox.askyesno("Onay", "Programı durdurmak istediğinize emin misiniz?"):
            success = self.simulator.stop_program(m["exec_id"])
            if not success:
                messagebox.showwarning("Uyarı", "Durdurma başarısız.")
