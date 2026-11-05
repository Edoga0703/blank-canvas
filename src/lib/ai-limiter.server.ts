// src/lib/ai-limiter.server.ts
/**
 * Gestor global de concurrencia y límites de velocidad para llamadas de IA (Drael, OpenAI, Claude, Gemini).
 * Implementa el patrón Semáforo con colas de prioridad (Priority Queue) para garantizar que:
 * 1. Drael nunca supere su límite duro de 4 llamadas simultáneas (reserva 1 slot de seguridad).
 * 2. Las acciones interactivas humanas (prioridad 1) nunca se vean bloqueadas por procesos masivos.
 * 3. Los procesos masivos (prioridad 3) cedan el paso y no generen errores HTTP 429.
 */

type Task<T> = () => Promise<T>;

interface QueueItem {
  priority: number; // 1 = Alta (Humana / Chat vivo), 2 = Media (Motor 30m), 3 = Baja (Reanálisis Masivo)
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  task: Task<any>;
  enqueuedAt: number;
}

class AiConcurrencyLimiter {
  private activeCount = 0;
  private queue: QueueItem[] = [];

  // Drael soporta un máximo de 4 llamadas simultáneas.
  // Por diseño de seguridad, establecemos el límite por defecto en 3 para dejar 1 slot libre de amortiguación.
  private maxConcurrency = 3;

  public setMaxConcurrency(limit: number) {
    this.maxConcurrency = Math.max(1, Math.min(limit, 15));
  }

  public getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Programa una tarea protegida por el semáforo con orden de prioridad.
   */
  public async schedule<T>(task: Task<T>, priority: 1 | 2 | 3 = 2): Promise<T> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      try {
        return await task();
      } finally {
        this.activeCount--;
        this.processNext();
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        priority,
        resolve,
        reject,
        task,
        enqueuedAt: Date.now(),
      });
      // Ordena por prioridad ascendente (1 primero) y luego por antigüedad FIFO
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.enqueuedAt - b.enqueuedAt;
      });
    });
  }

  private processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) return;

    const next = this.queue.shift();
    if (!next) return;

    this.activeCount++;
    Promise.resolve()
      .then(() => next.task())
      .then(next.resolve, next.reject)
      .finally(() => {
        this.activeCount--;
        this.processNext();
      });
  }
}

export const globalAiLimiter = new AiConcurrencyLimiter();
