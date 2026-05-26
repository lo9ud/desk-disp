import styles from "./styles/Settings.module.css";
import ThemeSection from "./ThemeSection";
import { Component, memo, useState } from "react";
import GeneralSection from "./GeneralSection";
import AdvancedSection from "./AdvancedSection";
import AboutSection from "./AboutSection";
import { combineClassNames } from "../../utils/format";
import LayoutSection from "./LayoutSection";

/* Component  */

const TABS = {
  general: GeneralSection,
  themes: ThemeSection,
  layouts: LayoutSection,
  advanced: AdvancedSection,
  licenses: AboutSection,
};

export default function SettingsPage() {
  const [tab, setTab] = useState<keyof typeof TABS>("general");
  const TabComponent = TABS[tab];
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Settings</h1>
      <div className={styles.tabs}>
        {Object.keys(TABS).map((t) => (
          <button
            key={t}
            className={`${styles.sectionTitle} ${t === tab ? styles.active : ""}`}
            onClick={() => setTab(t as keyof typeof TABS)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className={styles.tabContent}>
        {Object.entries(TABS).map(([key, Component]) => (
          <div key={key} className={combineClassNames(key === tab ? "" : styles.hidden, styles.contentContainer)}>
            <Component />
          </div>
        ))}
      </div>
    </div>
  );
}
