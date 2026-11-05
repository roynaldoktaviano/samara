import { RECRUITMENT_NOTIFY_KEY } from '@/lib/hr/recruitment'
import { userListSettingHandlers } from '@/lib/hr/recruitment-user-list-route'

// Who besides HR gets told about every new Recruitment Request (e.g. management).
const handlers = userListSettingHandlers(RECRUITMENT_NOTIFY_KEY)
export const GET = handlers.GET
export const PUT = handlers.PUT
