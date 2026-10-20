import platform
import math
from pathlib import Path
from threading import Lock
import psutil
from core.schema import TelemetrySnapshot, ProcessInfo

_collection_lock = Lock()


def collect_telemetry() -> TelemetrySnapshot:
    # process_iter reutiliza objetos: evitar muestras de CPU superpuestas.
    with _collection_lock:
        return _collect_telemetry()


def _collect_telemetry() -> TelemetrySnapshot:
    # 1. Memoria y disco
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage(Path.cwd().anchor)

    # 2. Procesos: se instancian antes del muestreo de CPU para medir su
    # consumo real durante el intervalo (la primera lectura siempre es 0.0).
    process_list = list(psutil.process_iter(['pid', 'name']))
    for p in process_list:
        try:
            p.cpu_percent(None)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    cpu_pct = psutil.cpu_percent(interval=0.5)

    processes = []
    for p in process_list:
        try:
            info = p.info
            processes.append(ProcessInfo(
                pid=info['pid'],
                name=info['name'] or "unknown",
                cpu_percent=round(p.cpu_percent(None) or 0.0, 2),
                memory_percent=round(p.memory_percent() or 0.0, 2)
            ))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    top_cpu = sorted(processes, key=lambda x: x.cpu_percent, reverse=True)[:5]
    top_ram = sorted(processes, key=lambda x: x.memory_percent, reverse=True)[:5]

    # 3. Sensores de temperatura (si están disponibles)
    temp_val = None
    if hasattr(psutil, "sensors_temperatures"):
        try:
            temps = psutil.sensors_temperatures()
            for name in ['coretemp', 'k10temp', 'cpu_thermal', 'zenpower']:
                values = [sensor.current for sensor in temps.get(name, [])
                          if sensor.current is not None and math.isfinite(sensor.current) and sensor.current > 0]
                if values:
                    temp_val = max(values)
                    break
        except (OSError, psutil.Error, NotImplementedError):
            # Un sensor inaccesible no debe impedir leer CPU, memoria y procesos.
            pass

    return TelemetrySnapshot(
        os=platform.system(),
        cpu_percent=cpu_pct,
        ram_total_gb=round(mem.total / (1024**3), 2),
        ram_used_percent=mem.percent,
        disk_total_gb=round(disk.total / (1024**3), 2),
        disk_used_percent=disk.percent,
        cpu_temp_celsius=temp_val,
        top_cpu_processes=top_cpu,
        top_ram_processes=top_ram
    )
