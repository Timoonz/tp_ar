import { zzfx } from "zzfx";

export type SoundEffect =
    | "blockDestruction"
    | "blockHit"
    | "levelUp"
    | "gameOver"

type ZzfxParams = (number | undefined)[];

interface SoundConfig {
    params: ZzfxParams
    volume?: number,
}

export class SynthManager {
    private sounds: Map<SoundEffect, SoundConfig> = new Map();
    private globalVolume: number = 1.0;
    private muted: boolean = false;

    private readonly soundConfigs: Record<SoundEffect, SoundConfig> = {
        blockDestruction: {
            params: [0, , 277, , .11, .05, 1, 1.6, 62.8, -0.1, 56, .03, .13, .5, 233, .2, .21, .77, .47, .29, 426],
            volume: 1.8,
        },
        levelUp: {
            params: [, , 338, .05, .04, .04, 1, 3.6, , 42, -184, .02, .02, , , , .07, .88, .1, .32, 336],
            volume: 2.0,
        },
        blockHit: {
            params: [, , 242, .05, .03, .03, , 2.4, , , -151, .01, .04, , , .2, .24, .85, .08, , -1422],
            volume: 1.6,
        },
        gameOver: {
            params: [, , 925, .04, .3, .6, 1, .3, , 6.27, -184, .09, .17],
            volume: 2.0,
        }
    };

    constructor() {
        for (const [key, config] of Object.entries(this.soundConfigs)) {
            this.sounds.set(key as SoundEffect, config);
        }
    };

    private buildParams(effect: SoundEffect): ZzfxParams | null {
        if (this.muted) return null;

        const config = this.sounds.get(effect);
        if (!config) return null;

        const adjustedParams = [...config.params];
        const effectVolume = config.volume ?? 1.0;
        adjustedParams[0] = effectVolume * this.globalVolume;

        return adjustedParams;
    }

    play(effect: SoundEffect): void {
        const params = this.buildParams(effect);
        if (!params) return;
        zzfx(...params);
    };

    /**
     * Plays a sound routed through a PannerNode for 3D spatialization.
     *
     * zzfx internally connects its output GainNode straight to ctx.destination.
     * This method intercepts that GainNode, disconnects it from destination,
     * and reconnects it through the provided panner instead.
     *
     * The panner must already be connected to ctx.destination before calling this.
     */
    playSpatialized(effect: SoundEffect, panner: PannerNode): void {
        const params = this.buildParams(effect);
        if (!params) return;

        // zzfx returns the GainNode at the end of its internal audio chain,
        // already wired to zzfxX.destination
        const gainNode = zzfx(...params) as GainNode | undefined;

        if (!gainNode) {
            // zzfx returned nothing (some environments / muted state) — silent fallback
            return;
        }

        // Cut the direct-to-destination connection, reroute through the panner
        gainNode.disconnect();
        gainNode.connect(panner);
    };

    toggleMute(): boolean {
        this.muted = !this.muted;
        return this.muted;
    };

    isMuted(): boolean {
        return this.muted;
    };

    destroy(): void {
        this.sounds.clear();
    };

}