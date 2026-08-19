#!/usr/bin/env bash
#
# Manage the retrospective-agent access allowlist.
#
# The allowlist lives in the Secret Manager secret `retrospective-allowed-emails`
# as one comma-separated string. Secret versions are immutable, whole-payload
# snapshots -- there is no in-place edit and no merge -- so every change here
# reads the current value and writes the full list back as a new version.
#
# See README.md ("Adding or Removing Users") for the surrounding context.

set -euo pipefail

PROJECT=${ALLOWLIST_PROJECT:-gdl-reader-dev}
SECRET=${ALLOWLIST_SECRET:-retrospective-allowed-emails}
SERVICE=${ALLOWLIST_SERVICE:-retrospective-agent}
REGION=${ALLOWLIST_REGION:-us-east1}

ASSUME_YES=false
DRY_RUN=false
FORCE=false

# Scratch files, cleaned up on exit. Kept global so the EXIT trap can see them --
# a trap referencing a function-local would trip `set -u` at exit and fail the
# script after a successful write.
TMPFILE=""
ERRFILE=""
cleanup() {
    [[ -n $TMPFILE ]] && rm -f "$TMPFILE"
    [[ -n $ERRFILE ]] && rm -f "$ERRFILE"
    return 0
}
trap cleanup EXIT

usage() {
    cat <<'EOF'
Usage: scripts/allowlist.sh <command> [options] [email...]

Commands:
  list                     Print the current allowlist, one email per line
  add EMAIL [EMAIL...]     Add emails to the allowlist (existing entries kept)
  remove EMAIL [EMAIL...]  Remove emails from the allowlist
  redeploy                 Restart the service on its current image, so a
                           secret change takes effect immediately
  versions                 List the secret's versions

Options:
  --yes        Skip the confirmation prompt (required when non-interactive)
  --dry-run    Show what would change without writing a new version
  --force      Allow a change that would empty the allowlist
  -h, --help   Show this help

Environment overrides: ALLOWLIST_PROJECT, ALLOWLIST_SECRET, ALLOWLIST_SERVICE,
ALLOWLIST_REGION.

Permissions: reading needs roles/secretmanager.secretAccessor; add/remove also
needs roles/secretmanager.secretVersionAdder; versions needs
roles/secretmanager.viewer; redeploy needs roles/run.developer plus
roles/iam.serviceAccountUser on the runtime service account. Details in
README.md, "Permissions required".

Examples:
  scripts/allowlist.sh list
  scripts/allowlist.sh add --dry-run jan@example.com
  scripts/allowlist.sh add jan@example.com miguel@example.com
  scripts/allowlist.sh redeploy
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

note() {
    printf '%s\n' "$*" >&2
}

# Normalize the way src/config.ts does: trim, lowercase.
normalize() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]'
}

valid_email() {
    [[ $1 =~ ^[^[:space:],@]+@[^[:space:],@]+\.[^[:space:],@]+$ ]]
}

contains() {
    local needle=$1
    shift
    local item
    for item in "$@"; do
        [[ $item == "$needle" ]] && return 0
    done
    return 1
}

join_commas() {
    local out="" item
    for item in "$@"; do
        if [[ -z $out ]]; then out=$item; else out="$out,$item"; fi
    done
    printf '%s' "$out"
}

require_gcloud() {
    command -v gcloud >/dev/null 2>&1 ||
        die "gcloud is not installed. See README.md (Developer Setup) to install it."
}

# Reads one version's payload to stdout ("latest" if unspecified). Keeps stderr
# out of the payload, and turns the failures you actually hit -- expired
# credentials, a missing role -- into instructions.
read_version() {
    local version=${1:-latest} out status err
    ERRFILE=${ERRFILE:-$(mktemp)}
    set +e
    out=$(gcloud secrets versions access "$version" \
        --secret="$SECRET" --project="$PROJECT" 2>"$ERRFILE")
    status=$?
    set -e

    if [[ $status -ne 0 ]]; then
        err=$(cat "$ERRFILE")
        case $err in
            *Reauthentication*|*"auth login"*|*"invalid_grant"*)
                die "gcloud credentials have expired. Run: gcloud auth login" ;;
            *PERMISSION_DENIED*|*"does not have"*)
                die "Reading $SECRET needs roles/secretmanager.secretAccessor (on the secret or on $PROJECT). See README.md, 'Permissions required'." ;;
            *)
                printf '%s\n' "$err" >&2
                die "Could not read secret $SECRET." ;;
        esac
    fi
    printf '%s' "$out"
}

# Populates the global `current` array from the secret's current value.
load_current() {
    local raw parts part clean
    raw=$(read_version)
    current=()
    IFS=',' read -r -a parts <<<"$raw"
    for part in ${parts[@]+"${parts[@]}"}; do
        clean=$(normalize "$part")
        [[ -n $clean ]] && current+=("$clean")
    done
}

# Writes the given emails as a new secret version, after showing the diff and
# confirming. Uses printf, not echo -- a trailing newline would end up inside
# the last email address.
write_version() {
    local payload verify
    payload=$(join_commas "$@")

    [[ -n $payload ]] || $FORCE ||
        die "That would empty the allowlist and lock everyone out. Pass --force if you mean it."

    if $DRY_RUN; then
        note "--dry-run: not writing. New value would be:"
        printf '%s\n' "$payload"
        return 0
    fi

    if ! $ASSUME_YES; then
        if [[ -t 0 ]]; then
            local reply
            read -r -p "Write this as a new version of $SECRET? [y/N] " reply
            [[ $reply =~ ^[Yy] ]] || die "Aborted."
        else
            die "Refusing to write without confirmation. Re-run with --yes."
        fi
    fi

    TMPFILE=$(mktemp)
    ( umask 077; printf '%s' "$payload" >"$TMPFILE" )

    local version_name version add_status err
    ERRFILE=${ERRFILE:-$(mktemp)}
    set +e
    version_name=$(gcloud secrets versions add "$SECRET" \
        --project="$PROJECT" --data-file="$TMPFILE" --format='value(name)' 2>"$ERRFILE")
    add_status=$?
    set -e
    err=$(cat "$ERRFILE")
    if [[ $add_status -ne 0 ]]; then
        printf '%s\n' "$err" >&2
        case $err in
            *PERMISSION_DENIED*|*"does not have"*)
                die "Writing a new version needs roles/secretmanager.secretVersionAdder -- reading the allowlist does not imply writing it. See README.md, 'Permissions required'." ;;
            *)
                die "Could not add a new version of $SECRET." ;;
        esac
    fi

    version=${version_name##*/}
    note "Created version ${version:-?} of $SECRET."

    # Verify against the version we just created. Asking for "latest" here races
    # propagation and can return the previous version, which would report a
    # successful write as a failure.
    verify=$(read_version "${version:-latest}")
    if [[ $verify != "$payload" ]]; then
        note "Wrote version $version, but reading it back gave something else."
        note "  expected: $payload"
        note "  got:      $verify"
        die "Verification failed. The version was created -- check it before rewriting."
    fi
    note "Verified: the new version matches."
    note "Change takes effect on the next container startup."
    note "To apply it now: scripts/allowlist.sh redeploy"
}

cmd_list() {
    local email
    load_current
    for email in ${current[@]+"${current[@]}"}; do
        printf '%s\n' "$email"
    done
    note "${#current[@]} email(s) in $SECRET."
}

cmd_add() {
    [[ $# -gt 0 ]] || die "add needs at least one email address."
    local email clean added=() updated=()

    load_current
    updated=(${current[@]+"${current[@]}"})

    for email in "$@"; do
        clean=$(normalize "$email")
        valid_email "$clean" || die "Not a valid email address: $email"
        if contains "$clean" ${updated[@]+"${updated[@]}"}; then
            note "already present, skipping: $clean"
        else
            updated+=("$clean")
            added+=("$clean")
        fi
    done

    if [[ ${#added[@]} -eq 0 ]]; then
        note "Nothing to add -- no new version written."
        return 0
    fi

    printf 'Current (%d):\n' "${#current[@]}"
    for email in ${current[@]+"${current[@]}"}; do printf '  %s\n' "$email"; done
    printf 'Adding (%d):\n' "${#added[@]}"
    for email in "${added[@]}"; do printf '  + %s\n' "$email"; done

    write_version ${updated[@]+"${updated[@]}"}
}

cmd_remove() {
    [[ $# -gt 0 ]] || die "remove needs at least one email address."
    local email clean keep active removed=() updated=()

    load_current

    active=$(gcloud config get-value account 2>/dev/null || true)
    active=$(normalize "${active:-}")

    for email in "$@"; do
        clean=$(normalize "$email")
        if contains "$clean" ${current[@]+"${current[@]}"}; then
            removed+=("$clean")
            [[ -n $active && $clean == "$active" ]] &&
                note "warning: $clean is your own gcloud account."
        else
            note "not in the allowlist, skipping: $clean"
        fi
    done

    if [[ ${#removed[@]} -eq 0 ]]; then
        note "Nothing to remove -- no new version written."
        return 0
    fi

    for keep in ${current[@]+"${current[@]}"}; do
        contains "$keep" "${removed[@]}" || updated+=("$keep")
    done

    printf 'Current (%d):\n' "${#current[@]}"
    for email in ${current[@]+"${current[@]}"}; do printf '  %s\n' "$email"; done
    printf 'Removing (%d):\n' "${#removed[@]}"
    for email in "${removed[@]}"; do printf '  - %s\n' "$email"; done

    write_version ${updated[@]+"${updated[@]}"}
}

# Redeploys the image the service is already running. Images are tagged by
# commit SHA (see cloudbuild.yaml) -- there is no :latest tag, so the reference
# has to be looked up rather than hardcoded.
cmd_redeploy() {
    local image url code deploy_out deploy_status
    image=$(gcloud run services describe "$SERVICE" \
        --region="$REGION" --project="$PROJECT" \
        --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true)
    [[ -n $image ]] ||
        die "Could not read $SERVICE. Redeploying needs roles/run.developer on $PROJECT. See README.md, 'Permissions required'."
    note "Redeploying $SERVICE on $image"

    if $DRY_RUN; then
        note "--dry-run: not deploying."
        return 0
    fi

    set +e
    deploy_out=$(gcloud run deploy "$SERVICE" \
        --region="$REGION" --project="$PROJECT" --image="$image" 2>&1)
    deploy_status=$?
    set -e
    printf '%s\n' "$deploy_out"
    if [[ $deploy_status -ne 0 ]]; then
        case $deploy_out in
            *actAs*|*iam.serviceAccounts.actAs*|*"service account"*)
                die "Deploying needs roles/iam.serviceAccountUser on the runtime service account, in addition to roles/run.developer. See README.md, 'Permissions required'." ;;
            *)
                die "Redeploy failed." ;;
        esac
    fi

    url=$(gcloud run services describe "$SERVICE" \
        --region="$REGION" --project="$PROJECT" --format='value(status.url)')
    if [[ -n $url ]]; then
        code=$(curl -s -o /dev/null -w '%{http_code}' "$url/health" || true)
        note "health check: $url/health -> ${code:-no response}"
        [[ $code == "200" ]] || die "Service did not return a healthy /health."
    fi
}

cmd_versions() {
    gcloud secrets versions list "$SECRET" --project="$PROJECT"
}

main() {
    local command="" args=()

    while [[ $# -gt 0 ]]; do
        case $1 in
            --yes|-y)   ASSUME_YES=true ;;
            --dry-run)  DRY_RUN=true ;;
            --force)    FORCE=true ;;
            -h|--help)  usage; return 0 ;;
            -*)         die "Unknown option: $1" ;;
            *)
                if [[ -z $command ]]; then command=$1; else args+=("$1"); fi
                ;;
        esac
        shift
    done

    [[ -n $command ]] || { usage; return 1; }
    require_gcloud

    case $command in
        list)     cmd_list ;;
        add)      cmd_add ${args[@]+"${args[@]}"} ;;
        remove)   cmd_remove ${args[@]+"${args[@]}"} ;;
        redeploy) cmd_redeploy ;;
        versions) cmd_versions ;;
        *)        die "Unknown command: $command (try --help)" ;;
    esac
}

main "$@"
