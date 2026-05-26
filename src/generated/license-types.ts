export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  licenseText: string | null;
  repository: string | null;
  publisher: string | null;
  ecosystem: "npm" | "cargo";
}
