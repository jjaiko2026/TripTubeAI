/**
 * TourAPI 배치 스크립트의 콘솔 출력을 logs/tour-api/phase3/ 아래 파일에도 함께 남긴다
 * (docs/PHASE3K_QUALITY_POLICY.md §15.5 — 과거 3-G/3-I/3-J-1~3의 실행 로그가 콘솔에만
 * 찍히고 파일로 남지 않아 사후 역추적이 불가능했던 문제의 최소 해결책).
 *
 * 기존 console.log/console.error/console.table 호출은 한 줄도 바꾸지 않는다 —
 * process.stdout/stderr.write를 감싸서 같은 내용을 파일에도 동시에 append할 뿐이다.
 * Node 내장 fs/path만 사용하고 외부 패키지는 쓰지 않는다.
 *
 * 로그 파일 기록 자체가 실패해도 원래 콘솔 출력과 TourAPI/DB 처리는 절대 막지 않는다 —
 * 실패 시 stderr에 그 사실만 남기고 조용히 콘솔 전용 동작으로 폴백한다.
 */
import fs from "fs";
import path from "path";

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function timestamp(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** stream.write를 감싸 같은 내용을 파일 디스크립터에도 동기적으로 append한다. */
function teeWrite(stream: NodeJS.WriteStream, fd: number): void {
  const original = stream.write.bind(stream);
  const teed = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    try {
      if (typeof chunk === "string") {
        fs.writeSync(fd, chunk);
      } else {
        fs.writeSync(fd, chunk);
      }
    } catch {
      // 로그 파일 기록 실패는 무시한다 — 콘솔 출력 자체는 항상 계속되어야 한다.
    }
    return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
  };
  stream.write = teed as typeof stream.write;
}

/**
 * 호출 시점부터 프로세스 종료까지의 모든 stdout/stderr 출력을
 * logs/tour-api/phase3/PHASE3-{phaseName}-{YYYYMMDD-HHmmss}.log 에 그대로 append한다.
 *
 * 각 배치 스크립트 최상단에서 한 번만 호출한다:
 *   import { startPhaseLog } from "./lib/log-to-file";
 *   startPhaseLog("K-3");
 */
export function startPhaseLog(phaseName: string): void {
  const dir = path.join(process.cwd(), "logs", "tour-api", "phase3");
  const filePath = path.join(dir, `PHASE3-${phaseName}-${timestamp()}.log`);

  let fd: number;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fd = fs.openSync(filePath, "a");
  } catch (e) {
    process.stderr.write(`[log-to-file] 로그 파일 생성 실패, 콘솔 출력만 계속됩니다: ${e}\n`);
    return;
  }

  teeWrite(process.stdout, fd);
  teeWrite(process.stderr, fd);

  process.on("exit", () => {
    try {
      fs.closeSync(fd);
    } catch {
      // 이미 닫혔거나 정리 불가 — 프로세스 종료를 막지 않는다.
    }
  });

  process.stdout.write(`[log-to-file] 로그 저장 시작: ${filePath}\n`);
}
