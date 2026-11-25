#!/usr/bin/env bash
# Full benchmark on b12676 (old-layout files, as in the first benchmark), then a spot check of the re-uploaded files.
cd "$(dirname "$0")"
python3 run_full_newbuild.py b12676
echo FULL_B12676_FINISHED
N=$HOME/MODELS/unsloth/Inkling-2-Mini-GGUF/root-2026-11-25
while pgrep -f "wget .*Inkling-2-Mini-UD-Q4_K_XL.gguf" > /dev/null; do sleep 10; done
ls -l "$N"
python3 newbuild_ab.py 0 "b12631:$N" "b12676:$N"
echo NEWFILES_AB_FINISHED
