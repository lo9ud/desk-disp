import { SelectInput, TextInput } from "../../components/inputs";
import InputGroup from "../../components/inputs/InputGroup";
import ToggleInput from "../../components/inputs/ToggleInput";
import pageStyles from "./styles/Settings.module.css";

export default function KeysSection() {
  return (
    <section className={pageStyles.section}>
      <InputGroup label="API Keys">
        <TextInput label="NASA" value="" onChange={(v) => void v} />
      </InputGroup>
      <InputGroup label="LLM">
        <ToggleInput label="Enable AI features" value={false} onChange={() => void 0} />
        {[
          {
            label: "ChatGPT",
            value: "chatgpt",
            variants: ["gpt-3.5-turbo", "gpt-4"],
          },
          {
            label: "Claude",
            value: "claude",
            variants: ["opus-4.8", "opus-4.7", "sonnet-3.6"],
          },
          {
            label: "Gemini",
            value: "gemini",
            variants: ["gemini-pro", "gemini-ultra"],
          },
        ].map(({ label, value, variants }) => (
          <InputGroup key={value} label={label}>
            <ToggleInput
              label="Enable?"
              value={false}
              onChange={() => void 0}
            />
            <SelectInput
              label="Model"
              options={variants.map((v) => ({ label: v, value: v }))}
              value={variants[0]}
              onChange={(v) => void v}
              disabled={true}
            />
            <TextInput
              label="API Key"
              value=""
              onChange={(v) => void v}
              disabled={true}
            />
          </InputGroup>
        ))}
      </InputGroup>
    </section>
  );
}
