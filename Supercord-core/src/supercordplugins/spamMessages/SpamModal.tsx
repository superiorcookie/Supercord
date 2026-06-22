/*
 * Spam Plugin - configuration modal
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Margins } from "@utils/margins";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize } from "@utils/modal";
import { ModalProps } from "@vencord/discord-types";
import { Button, Forms, Slider, Text, TextInput, useRef, useState } from "@webpack/common";

import { settings } from "./index";
import { isSpamming, MAX_MESSAGES, startSpamming, stopSpamming } from "./spammer";

export function SpamModal({ rootProps }: { rootProps: ModalProps; }) {
    const [content, setContent] = useState(settings.store.defaultMessage ?? "h");
    const [count, setCount] = useState(settings.store.defaultCount ?? 10);
    const [delay, setDelay] = useState(settings.store.defaultDelay ?? 500);
    const [running, setRunning] = useState(isSpamming());
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleStart = () => {
        // Persist the chosen values as the new defaults for convenience
        settings.store.defaultMessage = content;
        settings.store.defaultCount = count;
        settings.store.defaultDelay = delay;

        setRunning(true);
        startSpamming({
            content,
            count,
            delayMs: delay,
            file,
            onDone: () => setRunning(false),
        });
    };

    const handleStop = () => {
        stopSpamming();
        setRunning(false);
    };

    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-lg/semibold">Spam Messages</Text>
            </ModalHeader>

            <ModalContent>
                <Forms.FormSection className={Margins.top16}>
                    <Forms.FormTitle>Message</Forms.FormTitle>
                    <TextInput
                        value={content}
                        onChange={setContent}
                        placeholder="Message to spam"
                    />
                </Forms.FormSection>

                <Forms.FormSection className={Margins.top16}>
                    <Forms.FormTitle>Attachment (optional)</Forms.FormTitle>
                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: "none" }}
                        onChange={e => {
                            const selected = e.currentTarget.files?.[0] ?? null;
                            setFile(selected);
                        }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.PRIMARY}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {file ? "Change file" : "Choose file"}
                        </Button>
                        {file && (
                            <>
                                <Text variant="text-sm/normal" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {file.name}
                                </Text>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    color={Button.Colors.RED}
                                    look={Button.Looks.LINK}
                                    onClick={() => {
                                        setFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = "";
                                    }}
                                >
                                    Remove
                                </Button>
                            </>
                        )}
                    </div>
                    <Forms.FormText className={Margins.top8}>
                        The same file is re-uploaded for every message, so attachment spam is slower and more rate-limit prone.
                    </Forms.FormText>
                </Forms.FormSection>

                <Forms.FormSection className={Margins.top16}>
                    <Forms.FormTitle>Amount ({count} / {MAX_MESSAGES})</Forms.FormTitle>
                    <Slider
                        initialValue={count}
                        minValue={1}
                        maxValue={MAX_MESSAGES}
                        markers={[1, 10, 25, 50, 75, 100]}
                        onValueChange={v => setCount(Math.round(v))}
                        onValueRender={v => `${Math.round(v)}`}
                        stickToMarkers={false}
                    />
                </Forms.FormSection>

                <Forms.FormSection className={Margins.top16}>
                    <Forms.FormTitle>Delay between messages ({delay}ms)</Forms.FormTitle>
                    <Slider
                        initialValue={delay}
                        minValue={150}
                        maxValue={2000}
                        markers={[150, 250, 500, 1000, 2000]}
                        onValueChange={v => setDelay(Math.round(v))}
                        onValueRender={v => `${Math.round(v)}ms`}
                        stickToMarkers={false}
                    />
                    <Forms.FormText className={Margins.top8}>
                        Lower delays send faster but increase the chance of being rate limited.
                        Rate limits are handled automatically by waiting and resuming.
                    </Forms.FormText>
                </Forms.FormSection>
            </ModalContent>

            <ModalFooter>
                {running ? (
                    <Button
                        color={Button.Colors.RED}
                        onClick={handleStop}
                    >
                        Stop
                    </Button>
                ) : (
                    <Button
                        color={Button.Colors.BRAND}
                        onClick={handleStart}
                        disabled={!content && !file}
                    >
                        Start Spamming
                    </Button>
                )}
                <Button
                    color={Button.Colors.PRIMARY}
                    look={Button.Looks.LINK}
                    onClick={rootProps.onClose}
                >
                    Close
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}
