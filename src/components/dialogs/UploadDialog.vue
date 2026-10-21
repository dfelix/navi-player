<script setup lang="ts">
// Adding music (admins only): Upload sends files, folders or ZIPs; Organize
// sorts loose files in the music folder into album folders. The server side
// is server/library.ts; the requests are in services/upload.
import { computed, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "@/components/base/AppIcon.vue";
import { formatBytes, formatCount } from "@/lib/format";
import {
  applyCleanup,
  collectFiles,
  mergeUploadFiles,
  readDroppedEntries,
  scanLooseFiles,
  uploadOne,
  type ApplyResult,
  type CleanupGroup,
  type UploadFile,
  type UploadResult,
} from "@/services/upload";
import { useSessionStore } from "@/stores/session";
import "./upload.css";

const emit = defineEmits<{ close: [] }>();

const session = useSessionStore();
const { t } = useI18n();
const authHeaders = () => session.client?.getServerAuthHeaders() ?? {};
const message = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : t(fallback);

const mode = ref<"upload" | "organize">("upload");

function switchMode(next: "upload" | "organize"): void {
  if (mode.value === next) return;
  mode.value = next;
  error.value = null;
  scanError.value = null;
}

// ---- Upload ----

const files = ref<UploadFile[]>([]);
const phase = ref<"idle" | "uploading" | "done" | "error">("idle");
const progress = ref(0); // of the file being sent, 0–100
const progressLabel = ref("");
const result = ref<UploadResult | null>(null);
const error = ref<string | null>(null);
const dragOver = ref(false);

const audioInput = useTemplateRef<HTMLInputElement>("audioInput");
const folderInput = useTemplateRef<HTMLInputElement>("folderInput");
const zipInput = useTemplateRef<HTMLInputElement>("zipInput");

const add = (picked: UploadFile[]) => (files.value = mergeUploadFiles(files.value, picked));

function addPicked(event: Event): void {
  const picked = (event.target as HTMLInputElement).files;
  if (picked) add(collectFiles(picked));
}

async function onDrop(event: DragEvent): Promise<void> {
  dragOver.value = false;
  const transfer = event.dataTransfer;
  if (!transfer) return;
  // Dropped folders can only be read through their entries (and in Safari the
  // folder picker returns nothing, so dropping is the way). The entries must
  // be taken before the first await: the browser empties the drop after that.
  const entries = [...(transfer.items ?? [])]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  add(entries.length > 0 ? await readDroppedEntries(entries) : collectFiles(transfer.files));
}

function removeFile(path: string): void {
  files.value = files.value.filter((f) => f.path !== path);
}

// One file at a time, adding up what each request wrote or skipped.
async function startUpload(): Promise<void> {
  const queue = files.value;
  if (queue.length === 0) return;
  const headers = authHeaders();
  const total: UploadResult = { written: [], skipped: [], scanStarted: false };
  phase.value = "uploading";
  error.value = null;
  result.value = null;
  try {
    for (const [i, item] of queue.entries()) {
      progressLabel.value = t("upload.progress", {
        n: i + 1,
        total: queue.length,
        name: item.file.name,
      });
      progress.value = 0;
      const sent = await uploadOne(item, headers, (percent) => (progress.value = percent));
      total.written.push(...sent.written);
      total.skipped!.push(...(sent.skipped ?? []));
      // A scan started by an earlier file still counts if a later one wrote nothing.
      total.scanStarted = total.scanStarted || sent.scanStarted;
    }
    result.value = total;
    phase.value = "done";
  } catch (err) {
    error.value = message(err, "upload.failed");
    phase.value = "error";
  }
}

function resetUpload(): void {
  files.value = [];
  phase.value = "idle";
  progress.value = 0;
  progressLabel.value = "";
  result.value = null;
  error.value = null;
}

// ---- Organize ----

const scanPhase = ref<"idle" | "scanning" | "ready" | "applying" | "done" | "error">("idle");
const groups = ref<CleanupGroup[]>([]);
const selected = ref(new Set<string>());
const expanded = ref(new Set<string>());
const scanError = ref<string | null>(null);
const applyResult = ref<ApplyResult | null>(null);

const selectedFileCount = computed(() =>
  groups.value
    .filter((group) => selected.value.has(group.folder))
    .reduce((n, group) => n + group.files.length, 0),
);

async function scanLibrary(): Promise<void> {
  scanPhase.value = "scanning";
  scanError.value = null;
  applyResult.value = null;
  try {
    groups.value = await scanLooseFiles(authHeaders());
    // Everything is ticked to start with.
    selected.value = new Set(groups.value.map((group) => group.folder));
    expanded.value = new Set();
    scanPhase.value = "ready";
  } catch (err) {
    scanError.value = message(err, "upload.scanFailed");
    scanPhase.value = "error";
  }
}

// A copy of `set` with `folder` added or removed (a new Set, so Vue notices).
function toggle(set: Set<string>, folder: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(folder)) next.add(folder);
  return next;
}

async function organize(): Promise<void> {
  if (selected.value.size === 0) return;
  scanPhase.value = "applying";
  scanError.value = null;
  try {
    applyResult.value = await applyCleanup(authHeaders(), [...selected.value]);
    scanPhase.value = "done";
  } catch (err) {
    scanError.value = message(err, "upload.organizeFailed");
    scanPhase.value = "error";
  }
}
</script>

<template>
  <div class="upload-overlay" @click.self="emit('close')">
    <div
      class="upload-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('upload.dialogLabel')"
    >
      <div class="upload-head">
        <span class="upload-title">{{
          mode === "upload" ? t("upload.titleUpload") : t("upload.titleOrganize")
        }}</span>
        <button class="icon-btn" :aria-label="t('common.close')" @click="emit('close')">
          <AppIcon name="close" :size="18" />
        </button>
      </div>

      <div class="upload-tabs" role="tablist">
        <button
          class="upload-tab"
          :class="{ 'upload-tab-active': mode === 'upload' }"
          role="tab"
          :aria-selected="mode === 'upload'"
          @click="switchMode('upload')"
        >
          <AppIcon name="upload" :size="15" /> {{ t("upload.tabUpload") }}
        </button>
        <button
          class="upload-tab"
          :class="{ 'upload-tab-active': mode === 'organize' }"
          role="tab"
          :aria-selected="mode === 'organize'"
          @click="switchMode('organize')"
        >
          <AppIcon name="list" :size="15" /> {{ t("upload.tabOrganize") }}
        </button>
      </div>

      <!-- ===================== UPLOAD ===================== -->
      <template v-if="mode === 'upload'">
        <template v-if="phase === 'idle' || phase === 'error'">
          <div
            class="upload-drop"
            :class="{ 'upload-drop-active': dragOver }"
            @click="audioInput?.click()"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <AppIcon name="upload" :size="28" class="upload-drop-icon" />
            <span class="upload-drop-label">{{ t("upload.dropLabel") }}</span>
            <span class="upload-drop-hint">{{ t("upload.dropHint") }}</span>
          </div>

          <input
            ref="audioInput"
            type="file"
            accept="audio/*,.flac,.ogg,.opus,.wv,.ape,.dsf,.dff"
            multiple
            hidden
            @change="addPicked"
          />
          <input
            ref="folderInput"
            type="file"
            webkitdirectory
            multiple
            hidden
            @change="addPicked"
          />
          <input ref="zipInput" type="file" accept=".zip" hidden @change="addPicked" />

          <div class="upload-pickers">
            <button class="btn btn-ghost" @click.stop="audioInput?.click()">
              <AppIcon name="plus" :size="15" /> {{ t("upload.pickFiles") }}
            </button>
            <button class="btn btn-ghost" @click.stop="folderInput?.click()">
              <AppIcon name="list" :size="15" /> {{ t("upload.pickFolder") }}
            </button>
            <button class="btn btn-ghost" @click.stop="zipInput?.click()">
              <AppIcon name="list" :size="15" /> ZIP
            </button>
          </div>

          <i18n-t keypath="upload.note" tag="p" class="upload-note">
            <template #folder>
              <strong>{{ t("upload.folderPattern") }}</strong>
            </template>
          </i18n-t>

          <div v-if="files.length > 0" class="upload-file-list">
            <div v-for="uf in files" :key="uf.path" class="upload-file-item">
              <span class="upload-file-name" :title="uf.path">{{ uf.path }}</span>
              <span class="upload-file-size">{{ formatBytes(uf.file.size) }}</span>
              <button
                class="icon-btn upload-file-remove"
                :aria-label="t('upload.remove', { name: uf.file.name })"
                @click="removeFile(uf.path)"
              >
                <AppIcon name="close" :size="13" />
              </button>
            </div>
          </div>

          <div v-if="error" class="upload-error" role="alert">{{ error }}</div>

          <div class="upload-actions">
            <button class="btn btn-ghost" @click="emit('close')">{{ t("common.cancel") }}</button>
            <button class="btn btn-primary" :disabled="files.length === 0" @click="startUpload">
              {{
                files.length > 0
                  ? t("upload.uploadCount", { files: formatCount(files.length, "file") })
                  : t("upload.tabUpload")
              }}
            </button>
          </div>
        </template>

        <div v-else-if="phase === 'uploading'" class="upload-progress-wrap">
          <span class="upload-progress-label">{{ progressLabel }}</span>
          <div class="upload-progress-bar">
            <div class="upload-progress-fill" :style="{ width: `${progress}%` }" />
          </div>
        </div>

        <template v-else-if="phase === 'done' && result">
          <div class="upload-result">
            <span class="upload-result-success">
              {{ t("upload.uploaded", { files: formatCount(result.written.length, "file") }) }}
            </span>
            <span class="upload-result-detail">{{ t("upload.filed") }}</span>
            <span v-if="result.skipped?.length" class="upload-result-detail muted">{{
              t("upload.alreadyExisted", { files: formatCount(result.skipped.length, "file") })
            }}</span>
            <span v-if="result.scanStarted" class="upload-result-scan">{{
              t("upload.scanStarted")
            }}</span>
            <span v-else class="upload-result-detail muted">{{ t("upload.triggerScan") }}</span>
          </div>
          <div class="upload-actions">
            <button class="btn btn-ghost" @click="resetUpload">{{ t("upload.uploadMore") }}</button>
            <button class="btn btn-primary" @click="emit('close')">{{ t("common.done") }}</button>
          </div>
        </template>
      </template>

      <!-- ===================== ORGANIZE ===================== -->
      <template v-else>
        <template v-if="scanPhase === 'idle' || scanPhase === 'error'">
          <i18n-t keypath="upload.organizeNote" tag="p" class="upload-note">
            <template #root>
              <strong>{{ t("upload.root") }}</strong>
            </template>
            <template #folder>
              <strong>{{ t("upload.folderPattern") }}</strong>
            </template>
          </i18n-t>
          <div v-if="scanError" class="upload-error" role="alert">{{ scanError }}</div>
          <div class="upload-actions">
            <button class="btn btn-ghost" @click="emit('close')">{{ t("common.cancel") }}</button>
            <button class="btn btn-primary" @click="scanLibrary">
              <AppIcon name="list" :size="15" /> {{ t("upload.scan") }}
            </button>
          </div>
        </template>

        <div
          v-else-if="scanPhase === 'scanning' || scanPhase === 'applying'"
          class="upload-progress-wrap"
        >
          <span class="upload-progress-label">
            {{ scanPhase === "scanning" ? t("upload.scanning") : t("upload.moving") }}
          </span>
          <div class="upload-progress-bar">
            <div class="upload-progress-fill upload-progress-indeterminate" />
          </div>
        </div>

        <template v-else-if="scanPhase === 'ready'">
          <template v-if="groups.length === 0">
            <div class="upload-result">
              <span class="upload-result-success">{{ t("upload.nothingToOrganize") }}</span>
              <span class="upload-result-detail">{{ t("upload.noLooseFiles") }}</span>
            </div>
            <div class="upload-actions">
              <button class="btn btn-ghost" @click="scanPhase = 'idle'">
                {{ t("common.back") }}
              </button>
              <button class="btn btn-primary" @click="emit('close')">{{ t("common.done") }}</button>
            </div>
          </template>
          <template v-else>
            <span class="upload-organize-summary">
              {{
                t("upload.summary", {
                  selected: selected.size,
                  albums: formatCount(groups.length, "album"),
                  files: formatCount(selectedFileCount, "file"),
                })
              }}
            </span>

            <div class="upload-group-list">
              <div
                v-for="g in groups"
                :key="g.folder"
                class="upload-group"
                :class="{ 'upload-group-off': !selected.has(g.folder) }"
              >
                <div class="upload-group-head">
                  <label class="upload-group-check">
                    <input
                      type="checkbox"
                      :checked="selected.has(g.folder)"
                      :aria-label="t('upload.organizeFolder', { folder: g.folder })"
                      @change="selected = toggle(selected, g.folder)"
                    />
                  </label>
                  <button
                    class="upload-group-main"
                    :aria-expanded="expanded.has(g.folder)"
                    @click="expanded = toggle(expanded, g.folder)"
                  >
                    <AppIcon
                      name="chevron-right"
                      :size="15"
                      class="upload-group-chevron"
                      :class="{ 'upload-group-chevron-open': expanded.has(g.folder) }"
                    />
                    <span class="upload-group-folder" :title="g.folder">
                      {{ g.folder }}
                      <span
                        v-if="!g.hasTags"
                        class="upload-group-tag-warn"
                        :title="t('upload.untaggedHint')"
                      >
                        · {{ t("upload.untagged") }}
                      </span>
                    </span>
                    <span class="upload-group-count">{{
                      formatCount(g.files.length, "file")
                    }}</span>
                  </button>
                </div>

                <div v-if="expanded.has(g.folder)" class="upload-group-files">
                  <div v-for="f in g.files" :key="f.name" class="upload-group-file">
                    <span
                      class="upload-group-file-path"
                      :title="`${f.name} → ${g.folder}/${f.name}`"
                    >
                      <span class="upload-group-file-from">{{ f.name }}</span>
                      <AppIcon name="chevron-right" :size="12" class="upload-group-file-arrow" />
                      <span class="upload-group-file-to">{{ g.folder }}/{{ f.name }}</span>
                    </span>
                    <span class="upload-file-size">{{ formatBytes(f.size) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="upload-actions">
              <button class="btn btn-ghost" @click="scanPhase = 'idle'">
                {{ t("common.back") }}
              </button>
              <button class="btn btn-primary" :disabled="selected.size === 0" @click="organize">
                {{ t("upload.organizeCount", { albums: formatCount(selected.size, "album") }) }}
              </button>
            </div>
          </template>
        </template>

        <template v-else-if="scanPhase === 'done' && applyResult">
          <div class="upload-result">
            <span class="upload-result-success">
              {{ t("upload.organized", { files: formatCount(applyResult.moved.length, "file") }) }}
            </span>
            <span v-if="applyResult.errors.length > 0" class="upload-result-detail muted">
              {{ t("upload.skipped", { files: formatCount(applyResult.errors.length, "file") }) }}
            </span>
            <span v-if="applyResult.scanStarted" class="upload-result-scan">{{
              t("upload.reindexStarted")
            }}</span>
            <span v-else-if="applyResult.moved.length > 0" class="upload-result-detail muted">
              {{ t("upload.triggerReindex") }}
            </span>
          </div>
          <div class="upload-actions">
            <button class="btn btn-ghost" @click="scanLibrary">{{ t("upload.scanAgain") }}</button>
            <button class="btn btn-primary" @click="emit('close')">{{ t("common.done") }}</button>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.upload-file-remove {
  width: 24px;
  height: 24px;
}
</style>
