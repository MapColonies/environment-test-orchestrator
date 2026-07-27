{{- define "sar.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sar.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "sar.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "sar.labels" -}}
app.kubernetes.io/name: {{ include "sar.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "sar.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sar.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Return a persisted session secret. If one exists in the cluster we reuse it;
otherwise we generate 48 random characters on first install.
*/}}
{{- define "sar.sessionSecret" -}}
{{- if .Values.sessionSecret -}}
{{- .Values.sessionSecret -}}
{{- else -}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace (printf "%s-auth" (include "sar.fullname" .)) -}}
{{- if and $existing $existing.data (index $existing.data "SESSION_SECRET") -}}
{{- index $existing.data "SESSION_SECRET" | b64dec -}}
{{- else -}}
{{- randAlphaNum 48 -}}
{{- end -}}
{{- end -}}
{{- end -}}
