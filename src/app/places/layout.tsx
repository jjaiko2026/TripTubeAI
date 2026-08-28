import { redirect } from "next/navigation";

/**
 * "장소 둘러보기"(/places 및 그 하위 recommend/plan/[id]) 전체를 임시 비활성화한다.
 * 라우트 파일을 지우지 않고 이 레이아웃 하나로 서브트리 전체를 홈으로 돌려보내므로,
 * 되살리려면 이 파일만 삭제하면 된다.
 */
export default function PlacesDisabledLayout(): never {
  redirect("/");
}
