import { useState } from "react";
import { useInterval } from "../hooks/useInterval";
import { useTimeout } from "../hooks/useTimeout";
import styles from "./styles/Loading.module.css"

export default function Loading({what}:{what:string}) {
  const [dots, setDots] = useState(0);

  useInterval(() => setDots((d) => (d + 1) % 4), 500);

  const dotStr = ".".repeat(Math.min(dots, 2) + 1).padEnd(3, " ");
  const loadingText = `Loading ${what}${dotStr}`;
  return (
    <div className={styles.container}>
      <span className={styles.text}>
        <pre>
          {loadingText}
        </pre>
      </span>
      <div className={styles.spinner}/>
    </div>
  );
}

export function DelayedLoading({what, delay = 500}:{what:string, delay?:number}) {
  const [show, setShow] = useState(false);
  useTimeout(() => setShow(true), delay);
  if (!show) return null;
  return <Loading what={what}/>;
}