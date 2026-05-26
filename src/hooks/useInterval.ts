import { useEffect, useRef, useState } from "react";

export default function useInterval<T>(callback: () => T, delay: number) {
  const [value, setValue] = useState<T | null>(null);
  const savedCallback = useRef(callback);

  useEffect(() => {
    let id = setInterval(() => setValue(savedCallback.current()), delay);
    return () => {
      clearInterval(id);
    };
  }, [delay]);
}
