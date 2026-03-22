import { zzfx } from "zzfx";
export class SynthManager {
    sounds = new Map();
    globalVolume = 1.0;
    muted = false;
    soundConfigs = {
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
            this.sounds.set(key, config);
        }
    }
    ;
    play(effect) {
        if (this.muted)
            return;
        const config = this.sounds.get(effect);
        if (!config)
            return;
        const adjustedParams = [...config.params];
        const effectVolume = config.volume ?? 1.0;
        adjustedParams[0] = effectVolume * this.globalVolume;
        zzfx(...adjustedParams);
    }
    ;
    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }
    ;
    isMuted() {
        return this.muted;
    }
    ;
    destroy() {
        this.sounds.clear();
    }
    ;
}
//# sourceMappingURL=SynthManager.js.map