import { useState } from "react";
import type { LicenseEntry } from "../../generated/license-types";
import npmLicenses from "../../generated/licenses-npm.json";
import cargoLicenses from "../../generated/licenses-cargo.json";

import styles from "./styles/AboutSection.module.css";
import { TextInput } from "../../components/inputs";
import { Modal } from "../../primitives/Modal";
import { Button } from "../../primitives/Button";

const allLicenses: LicenseEntry[] = [
  ...(npmLicenses as LicenseEntry[]),
  ...(cargoLicenses as LicenseEntry[]),
].sort((a, b) => a.name.localeCompare(b.name));

function LicenseRow({ entry }: { entry: LicenseEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr>
        <td>
          {entry.repository ? (
            <a
              href={entry.repository}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.repoLink}
            >
              {entry.name}
            </a>
          ) : (
            entry.name
          )}
        </td>
        <td>v{entry.version}</td>
        <td>{entry.license}</td>
        <td>({entry.ecosystem})</td>
        <td>
          {entry.licenseText && (
            <button
              className={styles.licenseButton}
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? "Hide" : "Show"} license
            </button>
          )}
        </td>
      </tr>
      {expanded && entry.licenseText && (
        <Modal
          actions={[
            <Button key="close" variant="ghost" onClick={() => setExpanded(false)}>
              Close
            </Button>,
          ]}
          title={`${entry.name} License`}
        >
          <tr>
            <td colSpan={5}>
              <pre>{entry.licenseText}</pre>
            </td>
          </tr>
        </Modal>
      )}
    </>
  );
}

export default function AboutSection() {
  const [search, setSearch] = useState("");
  const filtered = search
    ? allLicenses.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.license.toLowerCase().includes(search.toLowerCase()),
      )
    : allLicenses;

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <h2>About</h2>
        <p>
          Desktop Disp is a customizable desktop dashboard built with web
          technologies. It is open source and available on{" "}
        </p>
        <p>Another paragraph about the project</p>
      </section>
      <section className={styles.section}>
        <h2>Attributions</h2>
        <p>
          The following open source libraries are used in this project (
          {allLicenses.length} total):
        </p>
        <TextInput
          placeholder="Search by name or license..."
          value={search}
          onChange={setSearch}
        />
        <div className={styles.licenseList}>
          <table>
            <thead className={styles.header}>
              <tr>
                <th>Package/Module</th>
                <th>Version</th>
                <th>License</th>
                <th>Ecosystem</th>
                <th>License Text</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <LicenseRow
                  key={`${entry.ecosystem}-${entry.name}-${entry.version}`}
                  entry={entry}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
