import { useEffect, useState } from "react";
import styles from "./styles/Loading.module.css"

export default function Loading({what}:{what:string}) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, []);

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
  useEffect(() => {
    const timeout = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);
  if (!show) return null;
  return <Loading what={what}/>;
}