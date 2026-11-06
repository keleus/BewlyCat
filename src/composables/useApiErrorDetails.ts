import ApiErrorToastContent from '~/components/ApiErrorToastContent.vue'
import type { ApiErrorReportSource } from '~/utils/apiDiagnostics'

// 弹窗由 App 根组件统一承载：触发位置可能在提示框这类随时消失的层里，
// 也可能在设置了 container-type 的列表内，那里的 position: fixed 会相对容器定位。
const activeApiErrorSource = shallowRef<ApiErrorReportSource | null>(null)

export function useActiveApiErrorSource() {
  return activeApiErrorSource
}

export function openApiErrorDetails(source: ApiErrorReportSource) {
  activeApiErrorSource.value = source
}

/** 提示框自动消失后仍可从页面的失败状态打开详情；提示框运行在独立 Vue 应用中，文案需提前翻译。 */
export function createApiErrorToastContent(message: string, actionLabel: string, source: ApiErrorReportSource) {
  return {
    component: markRaw(ApiErrorToastContent),
    props: { message, actionLabel },
    listeners: { details: () => openApiErrorDetails(source) },
  }
}
