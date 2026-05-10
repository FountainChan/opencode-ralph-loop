#!/usr/bin/env python3
"""
ralph-loop 插件清理脚本

扫描 opencode 配置文件中标记了 __cc_source 的命令条目并删除。
在卸载插件前执行，能清理残留的"孤儿命令"。

用法:
    python scripts/cleanup.py --source ralph-loop

建议在卸载插件前执行：
    npm uninstall ralph-loop
    python scripts/cleanup.py --source ralph-loop
"""

import argparse
import json
import os
import sys


def find_global_config():
    """查找全局 opencode.json 配置路径"""
    xdg_config = os.environ.get("XDG_CONFIG_HOME", "")
    if xdg_config:
        path = os.path.join(xdg_config, "opencode", "opencode.json")
        if os.path.exists(path):
            return path

    home = os.path.expanduser("~")
    path = os.path.join(home, ".config", "opencode", "opencode.json")
    if os.path.exists(path):
        return path

    path = os.path.join(home, "AppData", "Roaming", "opencode", "opencode.json")
    if os.path.exists(path):
        return path

    return None


def find_local_config(project_dir):
    """查找项目级 .opencode/opencode.json"""
    path = os.path.join(project_dir, ".opencode", "opencode.json")
    return path if os.path.exists(path) else None


def clean_config(config_path, source_tag, dry_run=False):
    if not config_path:
        return 0, {}

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"  ⚠️  读取失败: {e}")
        return 0, {}

    commands = config.get("command", {})
    if not commands:
        return 0, {}

    to_remove = []
    for key, value in commands.items():
        if isinstance(value, dict) and value.get("__cc_source") == source_tag:
            to_remove.append(key)

    if not to_remove:
        return 0, commands

    if dry_run:
        print(f"  🔍 发现 {len(to_remove)} 个待清理的命令:")
        for name in to_remove:
            print(f"    - {name}")
        return len(to_remove), commands

    for name in to_remove:
        del commands[name]

    config["command"] = commands
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    return len(to_remove), commands


def main():
    parser = argparse.ArgumentParser(
        description="清理 opencode 配置中 ralph-loop 插件的命令残留",
    )
    parser.add_argument(
        "--source",
        default="ralph-loop",
        help="要清理的 __cc_source 值 (默认: ralph-loop)",
    )
    parser.add_argument(
        "--project-dir",
        default=None,
        help="项目目录（清理项目级命令时需要，默认从当前目录获取）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅预览不修改",
    )
    parser.add_argument(
        "--global-config",
        default=None,
        help="指定全局 opencode.json 路径（自动查找）",
    )

    args = parser.parse_args()

    print(f"🧹 清理 __cc_source = '{args.source}' 的命令条目")
    print()

    # ── 清理全局配置 ──
    global_path = args.global_config or find_global_config()
    print(f"[全局配置] 目标: {global_path or '未找到'}")
    if global_path:
        removed, remaining = clean_config(global_path, args.source, args.dry_run)
        print(f"  {'将删除' if args.dry_run else '已删除'} {removed} 个命令，剩余 {len(remaining)} 个")
    else:
        print("  ⚠️  未找到全局 opencode.json，跳过")

    # ── 清理项目级配置 ──
    project_dir = args.project_dir or os.getcwd()
    local_path = find_local_config(project_dir)
    print(f"\n[项目配置] 目标: {local_path or '未找到'}")
    if local_path:
        removed, remaining = clean_config(local_path, args.source, args.dry_run)
        print(f"  {'将删除' if args.dry_run else '已删除'} {removed} 个命令，剩余 {len(remaining)} 个")
    else:
        print(f"  ⚠️  未找到 {project_dir}/.opencode/opencode.json，跳过")

    print()
    if args.dry_run:
        print("💡 以上为预览结果。去掉 --dry-run 执行实际清理。")
    else:
        print("✅ 清理完成。重启 opencode 后生效。")


if __name__ == "__main__":
    main()
