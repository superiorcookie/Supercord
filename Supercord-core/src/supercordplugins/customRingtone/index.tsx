/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AudioProcessor, PreprocessAudioData } from "@api/AudioPlayer";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { SupercordDevs } from "@utils/constants";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { React } from "@webpack/common";

const settings = definePluginSettings({
    customRingtones: {
        type: OptionType.CUSTOM,
        default: [] as { name: string, data: string }[],
        hidden: true
    },
    picker: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => {
            const { customRingtones } = settings.use(["customRingtones"]);
            const fileInputRef = React.useRef<HTMLInputElement>(null);

            const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
                const files = event.target.files;
                if (!files || files.length === 0) return;

                const newRingtones = [...(customRingtones || [])];

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const data = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target?.result as string);
                        reader.readAsDataURL(file);
                    });
                    newRingtones.push({ name: file.name, data });
                }

                settings.store.customRingtones = newRingtones;
                if (fileInputRef.current) fileInputRef.current.value = "";
            };

            const removeRingtone = (index: number) => {
                const newRingtones = [...(customRingtones || [])];
                newRingtones.splice(index, 1);
                settings.store.customRingtones = newRingtones;
            };

            return (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Button size="small" onClick={() => fileInputRef.current?.click()}>
                            Upload Custom Ringtones (MP3, OGG, WAV)
                        </Button>
                        {customRingtones && customRingtones.length > 0 && (
                            <Button size="small" variant="dangerPrimary" onClick={() => settings.store.customRingtones = []}>
                                Clear All
                            </Button>
                        )}
                    </div>
                    {customRingtones && customRingtones.length > 0 && (
                        <div style={{ color: "var(--text-positive)", marginTop: "4px" }}>
                            {customRingtones.length} custom ringtone(s) active! They will play in a cycle.
                        </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                        {customRingtones && customRingtones.map((rt, index) => (
                            <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", background: "var(--background-secondary)", borderRadius: "4px" }}>
                                <span style={{ color: "var(--text-normal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {index + 1}. {rt.name}
                                </span>
                                <Button size="min" variant="dangerPrimary" onClick={() => removeRingtone(index)}>
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp3,.ogg,.wav"
                        multiple
                        onChange={handleFileUpload}
                        style={{ display: "none" }}
                    />
                </div>
            );
        }
    }
});

let ringtoneIndex = 0;

const audioProcessor: AudioProcessor = (data: PreprocessAudioData) => {
    const ringtones = settings.store.customRingtones;
    if (typeof data.audio === "string" && data.audio.includes("call_ringing") && ringtones && ringtones.length > 0) {
        if (ringtoneIndex >= ringtones.length) ringtoneIndex = 0;
        data.audio = ringtones[ringtoneIndex].data;
        ringtoneIndex++;
    }
};

export default definePlugin({
    name: "CustomRingtone",
    description: "Easily set a custom MP3, OGG, or WAV ringtone for incoming calls.",
    tags: ["Voice", "Customisation", "Media"],
    authors: [SupercordDevs.superior, SupercordDevs.fries],
    settings,
    dependencies: ["AudioPlayerAPI"],
    startAt: StartAt.Init,
    audioProcessor,
});
