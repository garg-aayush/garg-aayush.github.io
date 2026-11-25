#!/usr/bin/env bash
# Extra tests on b12676 after the full rerun.
cd "$(dirname "$0")"
N=$HOME/MODELS/unsloth/Inkling-2-Mini-GGUF/root-2026-11-25
# 1. The re-uploaded model and drafter files (what the Unsloth guide downloads today): the two DSpark setups.
NB_TAG=newfiles NB_MDIR=$N NB_CEILING="f16_ub512_dspark:262144,q8_ub512_dspark:524288" \
  NB_CURVE2="f16_ub512_dspark,q8_ub512_dspark" python3 run_full_newbuild.py b12676 codedepth ceiling curve2
echo EXTRAS_NEWFILES_FINISHED
# 2. -ub 2048 (old-layout files, same folder as the full rerun): how much context it costs and what it gains.
NB_CEILING="f16_ub2048:262144,q8_ub2048_dspark:524288" NB_CURVE2="q8_ub2048_dspark" \
  python3 run_full_newbuild.py b12676 ceiling curve2
echo EXTRAS_FINISHED
