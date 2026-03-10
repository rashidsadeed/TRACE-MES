import csv
import json
import os
import traceback
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
    DataExportJob,
    TelemetryPacket,
    WorkOrderExecution,
    ProductionLog,
    ScrapLog,
)


class Command(BaseCommand):
    help = (
        "Process QUEUED DataExportJob records: aggregate data within the "
        "requested date range, write to CSV or JSON, and update job status."
    )

    def handle(self, *args, **options):
        jobs = DataExportJob.objects.filter(status='QUEUED').order_by('created_at')

        if not jobs.exists():
            self.stdout.write("No queued export jobs found.")
            return

        for job in jobs:
            self._process_job(job)

    # ------------------------------------------------------------------ #

    def _process_job(self, job):
        self.stdout.write(f"Processing export job {job.pk} ({job.format}) ...")

        # Mark as PROCESSING
        job.status = 'PROCESSING'
        job.save(update_fields=['status'])

        # Parquet not yet supported
        if job.format == 'PARQUET':
            job.status = 'FAILED'
            job.error_message = 'Parquet format not yet supported'
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'error_message', 'completed_at'])
            self.stderr.write(self.style.WARNING(f"Job {job.pk}: Parquet not supported."))
            return

        try:
            data = self._aggregate_data(job.date_from, job.date_to)
            file_path = self._write_file(job, data)

            job.status = 'COMPLETED'
            job.file_path = file_path
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'file_path', 'completed_at'])

            self.stdout.write(self.style.SUCCESS(f"Job {job.pk}: COMPLETED -> {file_path}"))

        except Exception as exc:
            job.status = 'FAILED'
            job.error_message = f"{exc.__class__.__name__}: {exc}\n{traceback.format_exc()}"
            job.completed_at = timezone.now()
            job.save(update_fields=['status', 'error_message', 'completed_at'])
            self.stderr.write(self.style.ERROR(f"Job {job.pk}: FAILED — {exc}"))

    # ------------------------------------------------------------------ #

    def _aggregate_data(self, date_from, date_to):
        """Collect rows from the four data sources within the date window."""
        rows = []

        # TelemetryPackets
        for tp in TelemetryPacket.objects.filter(
            timestamp__gte=date_from, timestamp__lte=date_to,
        ).select_related('machine').iterator():
            rows.append({
                'source': 'TelemetryPacket',
                'id': tp.pk,
                'machine': str(tp.machine_id),
                'timestamp': tp.timestamp.isoformat(),
                'spindle_speed': tp.spindle_speed,
                'feed_rate': tp.feed_rate,
                'temperature': tp.temperature,
                'vibration': tp.vibration,
            })

        # WorkOrderExecutions
        for ex in WorkOrderExecution.objects.filter(
            started_at__gte=date_from, started_at__lte=date_to,
        ).select_related('work_order', 'machine').iterator():
            rows.append({
                'source': 'WorkOrderExecution',
                'id': str(ex.pk),
                'work_order': str(ex.work_order_id),
                'machine': str(ex.machine_id),
                'operator': str(ex.operator_id) if ex.operator_id else '',
                'status': ex.status,
                'started_at': ex.started_at.isoformat(),
                'completed_at': ex.completed_at.isoformat() if ex.completed_at else '',
            })

        # ProductionLogs
        for pl in ProductionLog.objects.filter(
            recorded_at__gte=date_from, recorded_at__lte=date_to,
        ).iterator():
            rows.append({
                'source': 'ProductionLog',
                'id': str(pl.pk),
                'execution': str(pl.execution_id),
                'good_qty': pl.good_qty,
                'scrap_qty': pl.scrap_qty,
                'recorded_at': pl.recorded_at.isoformat(),
            })

        # ScrapLogs (use production_log__recorded_at as the time proxy)
        for sl in ScrapLog.objects.filter(
            production_log__recorded_at__gte=date_from,
            production_log__recorded_at__lte=date_to,
        ).select_related('defect_code').iterator():
            rows.append({
                'source': 'ScrapLog',
                'id': str(sl.pk),
                'production_log': str(sl.production_log_id),
                'defect_code': sl.defect_code.code if sl.defect_code else '',
                'qty': sl.qty,
            })

        return rows

    # ------------------------------------------------------------------ #

    def _write_file(self, job, data):
        """Write aggregated data to a file and return the absolute path."""
        export_dir = os.path.join(settings.BASE_DIR, 'exports')
        os.makedirs(export_dir, exist_ok=True)

        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        ext = 'csv' if job.format == 'CSV' else 'json'
        filename = f"export_{job.pk}_{ts}.{ext}"
        file_path = os.path.join(export_dir, filename)

        if job.format == 'JSON':
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=str)
        else:
            # CSV
            if not data:
                # Write an empty CSV with a header comment
                with open(file_path, 'w', encoding='utf-8', newline='') as f:
                    f.write('')
            else:
                # Collect all possible keys across rows
                all_keys = []
                seen = set()
                for row in data:
                    for k in row:
                        if k not in seen:
                            all_keys.append(k)
                            seen.add(k)

                with open(file_path, 'w', encoding='utf-8', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=all_keys, extrasaction='ignore')
                    writer.writeheader()
                    for row in data:
                        writer.writerow(row)

        return file_path
