/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText, Button, Heading, Paragraph, TextButton } from "@equicord/types/components";
import {
    Margins,
    ModalCloseButton,
    ModalContent,
    ModalHeader,
    ModalRoot,
    ModalSize,
    openModal,
    useForceUpdater
} from "@equicord/types/utils";
import { Toasts } from "@equicord/types/webpack/common";
import { Settings } from "shared/settings";

import { cl, SettingsComponent } from "./Settings";

export const DeveloperOptionsButton: SettingsComponent = ({ settings }) => {
    return <Button onClick={() => openDeveloperOptionsModal(settings)}>Open Developer Settings</Button>;
};

function openDeveloperOptionsModal(settings: Settings) {
    openModal(props => (
        <ModalRoot {...props} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <BaseText size="lg" weight="semibold" tag="h3" style={{ flexGrow: 1 }}>
                    Equibop Developer Options
                </BaseText>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>

            <ModalContent>
                <div style={{ padding: "1em 0" }}>
                    <Heading tag="h5">Supercord Location</Heading>
                    <SupercordLocationPicker settings={settings} />

                    <Heading tag="h5" className={Margins.top16}>
                        Debugging
                    </Heading>
                    <div className={cl("button-grid")}>
                        <Button onClick={() => VesktopNative.debug.launchGpu()}>Open chrome://gpu</Button>
                        <Button onClick={() => VesktopNative.debug.launchWebrtcInternals()}>
                            Open chrome://webrtc-internals
                        </Button>
                    </div>
                </div>
            </ModalContent>
        </ModalRoot>
    ));
}

const SupercordLocationPicker: SettingsComponent = ({ settings }) => {
    const forceUpdate = useForceUpdater();
    const usingCustomSupercordDir = VesktopNative.fileManager.isUsingCustomVencordDir();

    return (
        <>
            <Paragraph>
                Supercord files are loaded from{" "}
                {usingCustomSupercordDir ? (
                    <TextButton
                        variant="link"
                        onClick={e => {
                            e.preventDefault();
                            VesktopNative.fileManager.showCustomVencordDir();
                        }}
                    >
                        a custom location
                    </TextButton>
                ) : (
                    "the default location"
                )}
            </Paragraph>
            <div className={cl("button-grid")}>
                <Button
                    size={"small"}
                    onClick={async () => {
                        const choice = await VesktopNative.fileManager.selectSupercordDir();
                        switch (choice) {
                            case "cancelled":
                                break;
                            case "ok":
                                Toasts.show({
                                    message: "Supercord install changed. Fully restart Equibop to apply.",
                                    id: Toasts.genId(),
                                    type: Toasts.Type.SUCCESS
                                });
                                break;
                            case "invalid":
                                Toasts.show({
                                    message:
                                        "You did not choose a valid Supercord install. Make sure you're selecting the dist dir!",
                                    id: Toasts.genId(),
                                    type: Toasts.Type.FAILURE
                                });
                                break;
                        }
                        forceUpdate();
                    }}
                >
                    Change
                </Button>
                <Button
                    size={"small"}
                    variant="dangerPrimary"
                    onClick={async () => {
                        await VesktopNative.fileManager.selectSupercordDir(null);
                        forceUpdate();
                    }}
                >
                    Reset
                </Button>
            </div>
        </>
    );
};
