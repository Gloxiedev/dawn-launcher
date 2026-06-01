export function friendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
  const lower = `${code} ${raw}`.toLowerCase();

  if (lower.includes('enoent') && (lower.includes('.download') || lower.includes('rename'))) {
    return 'A required game file did not finish downloading. Dawn Launcher is repairing the installation — try again in a moment.';
  }

  if (lower.includes('enoent')) {
    return 'A required game file is missing. Dawn Launcher is repairing the installation.';
  }

  if (lower.includes('eacces') || lower.includes('eperm')) {
    return 'Dawn Launcher could not write to the Minecraft folder. Check folder permissions or choose a different install location in Settings.';
  }

  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('network')) {
    return 'Could not reach the download server. Check your internet connection and try again.';
  }

  if (lower.includes('checksum') || lower.includes('sha1') || lower.includes('hash')) {
    return 'A downloaded file was corrupted. Dawn Launcher will download it again.';
  }

  if (lower.includes('java') && (lower.includes('required') || lower.includes('install'))) {
    return 'Installing a compatible Java runtime for this Minecraft version…';
  }

  if (lower.includes('unsupported class file') || lower.includes('class file version')) {
    return 'The installed Java version is too old for this Minecraft release. Dawn Launcher will install a compatible runtime.';
  }

  if (lower.includes('instance not found')) {
    return 'The selected instance could not be found. Refresh the instance list or create a new instance.';
  }

  if (lower.includes('select an account')) {
    return 'Choose an account before launching Minecraft.';
  }

  if (lower.includes('access token') || lower.includes('sign in')) {
    return 'Your Microsoft session expired. Sign in again from the Accounts page.';
  }

  return raw || 'Something went wrong. Check the Console for details or try again.';
}
