# [<img src="./browser/icon.png" width="40" align="left" alt="Supercord">](https://github.com/Supercord/Supercord) Supercord

[![Equibop](https://img.shields.io/badge/Equibop-grey?style=flat)](https://github.com/Supercord/Equibop)
[![Tests](https://github.com/Supercord/Supercord/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/Supercord/Supercord/actions/workflows/test.yml)
[![Discord](https://img.shields.io/discord/1173279886065029291.svg?color=768AD4&label=Discord&logo=discord&logoColor=white)](https://supercord.org/discord)

Supercord is a fork of [Vencord](https://github.com/Vendicated/Vencord), with over 300+ plugins.

You can join our [Discord server](https://supercord.org/discord) for commits, changes, chatting, or even support.

### Included Plugins

Our included plugins can be found [here](https://supercord.org/plugins).

## Installing / Uninstalling

Windows

- [GUI](https://github.com/Supercord/Equilotl/releases/latest/download/Equilotl.exe)
- [CLI](https://github.com/Supercord/Equilotl/releases/latest/download/EquilotlCli.exe)

MacOS

- [X64 GUI](https://github.com/Supercord/Equilotl/releases/latest/download/Equilotl-darwin-x64.zip)
- [ARM64 GUI](https://github.com/Supercord/Equilotl/releases/latest/download/Equilotl-darwin-arm64.zip)

Linux

- [GUI](https://github.com/Supercord/Equilotl/releases/latest/download/Equilotl-x11)
- [CLI](https://github.com/Supercord/Equilotl/releases/latest/download/EquilotlCli-Linux)
- [AUR](https://aur.archlinux.org/packages?O=0&K=supercord)

```shell
bash -c "$(curl -sS https://raw.githubusercontent.com/Supercord/Supercord/refs/heads/main/misc/install.sh)"
```

## Installing Supercord Devbuild

### Dependencies

[Git](https://git-scm.com/download) and [Node.JS LTS](https://nodejs.dev/en/) are required.

Install `pnpm`:

> :exclamation: This next command may need to be run as admin/root depending on your system, and you may need to close and reopen your terminal for pnpm to be in your PATH.

```shell
npm i -g pnpm
```

> :exclamation: **IMPORTANT** Make sure you aren't using an admin/root terminal from here onwards. It **will** mess up your Discord/Supercord instance and you **will** most likely have to reinstall.

Clone Supercord:

```shell
git clone https://github.com/Supercord/Supercord
cd Supercord
```

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build Supercord:

```shell
pnpm build
```

Inject Supercord into your desktop client:

```shell
pnpm inject
```

Build Supercord for web:

```shell
pnpm buildWeb
```

After building Supercord's web extension, locate the appropriate ZIP file in the `dist` directory and follow your browser’s guide for installing custom extensions, if supported.

Note: Firefox extension zip requires Firefox for developers

## Credits

Thank you to [Vendicated](https://github.com/Vendicated) for creating [Vencord](https://github.com/Vendicated/Vencord) & [Suncord](https://github.com/verticalsync/Suncord) by [verticalsync](https://github.com/verticalsync) for helping when needed.

## Star History

<a href="https://star-history.com/#Supercord/Supercord&Timeline">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Supercord/Supercord&type=Timeline&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Supercord/Supercord&type=Timeline" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Supercord/Supercord&type=Timeline" />
  </picture>
</a>

## Disclaimer

Discord is trademark of Discord Inc., and solely mentioned for the sake of descriptivity.
Mentioning it does not imply any affiliation with or endorsement by Discord Inc.
Vencord is not connected to Supercord and as such, all donation links go to Vendicated's donation link.

<details>
<summary>Using Supercord violates Discord's terms of service</summary>

Client modifications are against Discord’s Terms of Service.

However, Discord is pretty indifferent about them and there are no known cases of users getting banned for using client mods! So you should generally be fine if you don’t use plugins that implement abusive behaviour. But no worries, all inbuilt plugins are safe to use!

Regardless, if your account is essential to you and getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to Supercord), just to be safe.

Additionally, make sure not to post screenshots with Supercord in a server where you might get banned for it.

</details>
