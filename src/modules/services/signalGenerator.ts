// src/services/signalGenerator.ts
import type { TokenTradingSignal } from '@/infra/external/tokenMetrics';
import { EventEmitter } from 'events'; // To emit buy/sell signals
import type { ISignalGenerator, ITokenMetricsClient, SignalGeneratorEvents } from '@/core/interfaces';

// Define events that the generator will emit
// export interface SignalGeneratorEvents {
//     buy: (symbol: string, signal: TokenTradingSignal) => void;
//     sell: (symbol: string, signal: TokenTradingSignal) => void;
//     error: (error: Error) => void;
// }

export declare interface SignalGenerator {
    on<K extends keyof SignalGeneratorEvents>(event: K, listener: SignalGeneratorEvents[K]): this;
    once<K extends keyof SignalGeneratorEvents>(event: K, listener: SignalGeneratorEvents[K]): this;
    emit<K extends keyof SignalGeneratorEvents>(event: K, ...args: Parameters<SignalGeneratorEvents[K]>): boolean;
}

export class SignalGenerator extends EventEmitter implements ISignalGenerator {
    private tmClient: ITokenMetricsClient;
    private lastSignals: Map<string, number>; // Map<symbol, last_signal>
    private intervalId: NodeJS.Timeout | null = null;
    private checkIntervalMs: number;
    private isChecking: boolean = false; // Prevent concurrent checks

    constructor(tokenMetricsClient: ITokenMetricsClient, checkIntervalMinutes: number = 60) {
        super();
        this.tmClient = tokenMetricsClient;
        this.lastSignals = new Map<string, number>();
        this.checkIntervalMs = checkIntervalMinutes * 60 * 1000; // Convert minutes to ms

        if (this.checkIntervalMs <= 0) {
            console.warn("SignalGenerator check interval must be positive. Defaulting to 60 minutes.");
            this.checkIntervalMs = 60 * 60 * 1000;
        }
    }

    public async start(): Promise<void> {
        if (this.intervalId) {
            console.log("SignalGenerator is already running.");
            return;
        }

        console.log(`Starting SignalGenerator. Checking signals every ${this.checkIntervalMs / 60000} minutes.`);

        // Perform an initial check immediately
        await this.checkSignals();

        // Then set the interval for subsequent checks
        this.intervalId = setInterval(async () => {
            await this.checkSignals();
        }, this.checkIntervalMs);
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("SignalGenerator stopped.");
        } else {
            console.log("SignalGenerator is not running.");
        }
    }

    private async checkSignals(): Promise<void> {
        if (this.isChecking) {
             console.log("Signal check already in progress, skipping this interval.");
             return;
        }
        this.isChecking = true;
        console.log(`[${new Date().toISOString()}] Checking for new trading signals...`);

        try {
            const currentSignals: TokenTradingSignal[] = await this.tmClient.getTradingSignals();

            if (!currentSignals || currentSignals.length === 0) {
                console.log("No trading signals received from API.");
                this.isChecking = false;
                return;
            }

            console.log(`Received ${currentSignals.length} signals.`);

            for (const signal of currentSignals) {
                const symbol = signal.symbol;
                const currentSignalValue = signal.signal;
                const lastSignalValue = this.lastSignals.get(symbol);

                // Check for Buy signal: Previous was -1 or 0, current is 1
                // Consider initial state (undefined lastSignalValue) as neutral (0)
                if ((lastSignalValue === -1 || lastSignalValue === 0 || lastSignalValue === undefined) && currentSignalValue === 1) {
                    console.log(`BUY SIGNAL detected for ${symbol}: ${lastSignalValue ?? 'N/A'} -> ${currentSignalValue}`);
                    this.emit('buy', symbol, signal);
                }
                // Check for Sell signal: Previous was 1 or 0, current is -1
                // Consider initial state (undefined lastSignalValue) as neutral (0)
                else if ((lastSignalValue === 1 || lastSignalValue === 0 || lastSignalValue === undefined) && currentSignalValue === -1) {
                    console.log(`SELL SIGNAL detected for ${symbol}: ${lastSignalValue ?? 'N/A'} -> ${currentSignalValue}`);
                    this.emit('sell', symbol, signal);
                }

                // Update the last known signal, regardless of whether an event was emitted
                this.lastSignals.set(symbol, currentSignalValue);
            }

            console.log("Signal check complete.");

        } catch (error: any) {
            console.error("Error during signal check:", error);
            this.emit('error', error instanceof Error ? error : new Error('Unknown error during signal check'));
        } finally {
             this.isChecking = false; // Ensure this runs even if there's an error
        }
    }

     // Optional: Method to get the current state for debugging or other purposes
    public getCurrentSignalsState(): ReadonlyMap<string, number> {
        return this.lastSignals;
    }
} 