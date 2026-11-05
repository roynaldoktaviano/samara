import { RECRUITMENT_APPROVERS_KEY } from '@/lib/hr/recruitment'
import { userListSettingHandlers } from '@/lib/hr/recruitment-user-list-route'

// Approver chain for new Recruitment Requests — all must approve (from My Approvals) before
// a request reaches HR. Empty list = requests go straight to HR as before.
const handlers = userListSettingHandlers(RECRUITMENT_APPROVERS_KEY)
export const GET = handlers.GET
export const PUT = handlers.PUT
