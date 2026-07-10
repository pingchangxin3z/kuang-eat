import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Card, Table, Tag, Input, Space, Typography, Alert, Descriptions, message, Popconfirm, Switch, Checkbox } from 'antd'
import {
  triggerGrab,
  stopJob,
  retryJob,
  retryJobUser,
  listJobs,
  getJob,
  getActiveMonitor,
  getAdminSettings,
  updateAdminSettings,
  setAdminKey,
  hasAdminKey
} from '@/api/admin'
import { cancelMonitor } from '@/api/monitor'
import type { AppSettings, Job, Monitor, MonitorSettings, MonitorUser, UserResult } from '../../server/types'

const { Title, Text } = Typography

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  queued: { color: 'blue', label: '排队中' },
  running: { color: 'processing', label: '执行中' },
  succeeded: { color: 'success', label: '成功' },
  failed: { color: 'error', label: '失败' },
  canceled: { color: 'default', label: '已停止' }
}

const MEAL_LABELS: Record<number, string> = { 1: '早餐', 2: '午餐', 3: '晚餐' }
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, value) => ({ label, value }))
const MEAL_OPTIONS = Object.entries(MEAL_LABELS).map(([value, label]) => ({ label, value: Number(value) }))

function summarizeSettings(settings: MonitorSettings): string {
  const weekdays = settings.selectedWeekdays.map((day) => WEEKDAY_LABELS[day] || String(day)).join('、')
  const meals = settings.selectedMealTypes.map((meal) => MEAL_LABELS[meal] || String(meal)).join('、')
  const rule =
    settings.matchMode === 'keywords'
      ? `关键词：${settings.keywords || '-'}`
      : `总量：早/晚<=${settings.stockThresholdBreakfastDinner}，午<=${settings.stockThresholdLunch}`
  return `${settings.weekPick} 所在周；${weekdays || '-'}；${meals || '-'}；${rule}`
}

function formatWeekdays(weekdays: number[]): string {
  return weekdays.map((day) => WEEKDAY_LABELS[day] || String(day)).join('、') || '-'
}

function formatMealTypes(mealTypes: number[]): string {
  return mealTypes.map((meal) => MEAL_LABELS[meal] || String(meal)).join('、') || '-'
}

function summarizeUserResult(result: UserResult | undefined): string {
  if (!result) return '暂无执行结果'
  return `成功${result.counts.ordered || 0} / 未匹配${result.counts.no_match || 0} / 失败${result.counts.error || 0}`
}

function isTerminalJob(job: Job | null): boolean {
  return !!job && ['succeeded', 'failed', 'canceled'].includes(job.status)
}

function AdminPage() {
  const [authed, setAuthed] = useState(hasAdminKey)
  const [keyInput, setKeyInput] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [monitor, setMonitor] = useState<Monitor | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [executionWeekdays, setExecutionWeekdays] = useState<number[]>([])
  const [executionMealTypes, setExecutionMealTypes] = useState<number[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [cancellingOpenids, setCancellingOpenids] = useState<string[]>([])
  const [operatingJobIds, setOperatingJobIds] = useState<string[]>([])
  const [retryingUsers, setRetryingUsers] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const key = params.get('key')
    if (key) {
      setAdminKey(key)
      setAuthed(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const refreshJobs = useCallback(async () => {
    try {
      const res = await listJobs(20)
      if (res.ok) setJobs(res.jobs)
    } catch { /* ignore */ }
  }, [])

  const refreshMonitor = useCallback(async () => {
    try {
      const res = await getActiveMonitor()
      if (res.ok) setMonitor(res.monitor)
    } catch { /* ignore */ }
  }, [])

  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await getAdminSettings()
      if (res.ok && res.settings) setAppSettings(res.settings)
    } catch { /* ignore */ }
    finally {
      setSettingsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authed) return
    refreshJobs()
    refreshMonitor()
    refreshSettings()
    pollRef.current = setInterval(refreshJobs, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [authed, refreshJobs, refreshMonitor, refreshSettings])

  useEffect(() => {
    if (!monitor) return
    setExecutionWeekdays(appSettings?.orderSelectedWeekdays || monitor.settings.selectedWeekdays)
    setExecutionMealTypes(appSettings?.orderSelectedMealTypes || monitor.settings.selectedMealTypes)
  }, [appSettings, monitor])

  useEffect(() => {
    if (!activeJob || isTerminalJob(activeJob)) {
      if (jobPollRef.current) clearInterval(jobPollRef.current)
      return
    }
    jobPollRef.current = setInterval(async () => {
      try {
        const res = await getJob(activeJob.id)
        if (res.ok && res.job) {
          setActiveJob(res.job)
          refreshJobs()
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => {
      if (jobPollRef.current) clearInterval(jobPollRef.current)
    }
  }, [activeJob, refreshJobs])

  const latestResultsByOpenid = useMemo(() => {
    const resultMap = new Map<string, { job: Job; result: UserResult }>()
    for (const job of jobs) {
      if (!job.result) continue
      for (const result of job.result.users) {
        if (!resultMap.has(result.openid)) resultMap.set(result.openid, { job, result })
      }
    }
    return resultMap
  }, [jobs])

  const handleLogin = () => {
    if (!keyInput.trim()) return
    setAdminKey(keyInput.trim())
    setAuthed(true)
  }

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      const res = await triggerGrab()
      if (!res.ok) {
        message.error(res.error || '触发失败')
        return
      }
      if (res.accepted) {
        message.success('任务已触发')
        setActiveJob(res.job || null)
      } else {
        message.warning('已有任务在执行中')
        setActiveJob(res.job || null)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '请求失败')
    } finally {
      setTriggering(false)
    }
  }

  const handleFeishuNotifyChange = async (checked: boolean) => {
    const previous = appSettings
    setAppSettings({
      orderSelectedWeekdays: previous?.orderSelectedWeekdays || null,
      orderSelectedMealTypes: previous?.orderSelectedMealTypes || null,
      feishuNotifyEnabled: checked,
      updatedAt: new Date().toISOString()
    })
    setSettingsSaving(true)
    try {
      const res = await updateAdminSettings({ feishuNotifyEnabled: checked })
      if (!res.ok || !res.settings) {
        setAppSettings(previous)
        message.error(res.error || '保存通知设置失败')
        return
      }
      setAppSettings(res.settings)
      message.success(checked ? '已开启飞书通知' : '已关闭飞书通知')
    } catch (err) {
      setAppSettings(previous)
      message.error(err instanceof Error ? err.message : '保存通知设置失败')
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleExecutionSettingsSave = async () => {
    if (executionWeekdays.length === 0) {
      message.warning('请至少选择一个工作日')
      return
    }
    if (executionMealTypes.length === 0) {
      message.warning('请至少选择一个餐次')
      return
    }
    const previous = appSettings
    setSettingsSaving(true)
    try {
      const res = await updateAdminSettings({
        orderSelectedWeekdays: executionWeekdays,
        orderSelectedMealTypes: executionMealTypes
      })
      if (!res.ok || !res.settings) {
        setAppSettings(previous)
        message.error(res.error || '保存执行范围失败')
        return
      }
      setAppSettings(res.settings)
      message.success('已保存执行范围')
    } catch (err) {
      setAppSettings(previous)
      message.error(err instanceof Error ? err.message : '保存执行范围失败')
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleExecutionSettingsReset = async () => {
    const previous = appSettings
    setSettingsSaving(true)
    try {
      const res = await updateAdminSettings({
        orderSelectedWeekdays: null,
        orderSelectedMealTypes: null
      })
      if (!res.ok || !res.settings) {
        setAppSettings(previous)
        message.error(res.error || '恢复用户选择失败')
        return
      }
      setAppSettings(res.settings)
      if (monitor) {
        setExecutionWeekdays(monitor.settings.selectedWeekdays)
        setExecutionMealTypes(monitor.settings.selectedMealTypes)
      }
      message.success('已恢复按用户选择执行')
    } catch (err) {
      setAppSettings(previous)
      message.error(err instanceof Error ? err.message : '恢复用户选择失败')
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleStopJob = async (job: Job) => {
    setOperatingJobIds((prev) => (prev.includes(job.id) ? prev : [...prev, job.id]))
    try {
      const res = await stopJob(job.id)
      if (!res.ok || !res.job) {
        message.error(res.error || '停止任务失败')
        return
      }
      setActiveJob(res.job)
      message.success('已请求停止任务')
      refreshJobs()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '停止任务失败')
    } finally {
      setOperatingJobIds((prev) => prev.filter((id) => id !== job.id))
    }
  }

  const handleRetryJob = async (job: Job) => {
    setOperatingJobIds((prev) => (prev.includes(job.id) ? prev : [...prev, job.id]))
    try {
      const res = await retryJob(job.id)
      if (!res.ok) {
        message.error(res.error || '重试任务失败')
        return
      }
      if (res.accepted) {
        message.success('已开始重试任务')
        setActiveJob(res.job || null)
      } else {
        message.warning('已有任务在执行中')
        setActiveJob(res.job || null)
      }
      refreshJobs()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '重试任务失败')
    } finally {
      setOperatingJobIds((prev) => prev.filter((id) => id !== job.id))
    }
  }

  const handleRetryUser = async (job: Job, result: UserResult) => {
    const key = `${job.id}:${result.openid}`
    setRetryingUsers((prev) => (prev.includes(key) ? prev : [...prev, key]))
    try {
      const res = await retryJobUser(job.id, result.openid)
      if (!res.ok) {
        message.error(res.error || '重试用户失败')
        return
      }
      if (res.accepted) {
        message.success(`已开始重试 ${result.nickname || result.openid}`)
        setActiveJob(res.job || null)
      } else {
        message.warning('已有任务在执行中')
        setActiveJob(res.job || null)
      }
      refreshJobs()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '重试用户失败')
    } finally {
      setRetryingUsers((prev) => prev.filter((item) => item !== key))
    }
  }

  const handleCancelMonitor = async (openid: string) => {
    setCancellingOpenids((prev) => (prev.includes(openid) ? prev : [...prev, openid]))
    try {
      await cancelMonitor([openid])
      message.success('已取消监控')
      refreshMonitor()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '取消监控失败')
    } finally {
      setCancellingOpenids((prev) => prev.filter((item) => item !== openid))
    }
  }

  if (!authed) {
    return (
      <div className="admin-login">
        <Card title="管理员验证">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>请输入管理密钥</Text>
            <Input.Password
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onPressEnter={handleLogin}
              placeholder="密钥"
            />
            <Button type="primary" block onClick={handleLogin}>
              进入
            </Button>
          </Space>
        </Card>
      </div>
    )
  }

  const monitorUserColumns = [
    {
      title: '状态',
      key: 'enabled',
      width: 72,
      render: (_: unknown, user: MonitorUser) => (
        user.enabled ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>
      )
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
      width: 140,
      ellipsis: true,
      render: (nickname: string, user: MonitorUser) => nickname || user.openid
    },
    {
      title: 'OpenID',
      dataIndex: 'openid',
      key: 'openid',
      width: 280,
      render: (openid: string) => <Text copyable className="admin-code-text">{openid}</Text>
    },
    {
      title: '监控内容',
      key: 'settings',
      width: 460,
      render: (_: unknown, user: MonitorUser) => (
        <Text className="admin-table-detail">
          {summarizeSettings(user.settings || monitor!.settings)}
        </Text>
      )
    },
    {
      title: '地址',
      key: 'address',
      width: 220,
      ellipsis: true,
      render: (_: unknown, user: MonitorUser) => user.settings?.addressDetail || monitor?.settings.addressDetail || '-'
    },
    {
      title: '最近结果',
      key: 'latestResult',
      width: 190,
      render: (_: unknown, user: MonitorUser) => {
        const latest = latestResultsByOpenid.get(user.openid)
        if (!latest) return <Text type="secondary">暂无</Text>
        const tag = STATUS_TAG[latest.job.status] || { color: 'default', label: latest.job.status }
        return (
          <Space direction="vertical" size={0}>
            <Tag color={tag.color}>{tag.label}</Tag>
            <Text className="admin-table-detail">{summarizeUserResult(latest.result)}</Text>
          </Space>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, user: MonitorUser) => (
        <Popconfirm
          title="取消监控"
          description={`确认取消 ${user.nickname || user.openid} 的监控吗？`}
          okText="确认"
          cancelText="返回"
          onConfirm={() => void handleCancelMonitor(user.openid)}
          disabled={!user.enabled}
        >
          <Button
            danger
            size="small"
            disabled={!user.enabled}
            loading={cancellingOpenids.includes(user.openid)}
          >
            取消监控
          </Button>
        </Popconfirm>
      )
    }
  ]

  const jobColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => <Text copyable className="admin-code-text">{id.slice(0, 8)}</Text>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const cfg = STATUS_TAG[status] || { color: 'default', label: status }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      }
    },
    {
      title: '结果',
      key: 'result',
      width: 260,
      render: (_: unknown, record: Job) => {
        if (!record.result) return record.error || '-'
        const c = record.result.counts
        return `成功${c.ordered} / 未匹配${c.no_match} / 失败${c.error}`
      }
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 190,
      render: (t: string) => new Date(t).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: Job) => (
        <Space size={6}>
          <Button
            size="small"
            danger
            disabled={isTerminalJob(record)}
            loading={operatingJobIds.includes(record.id)}
            onClick={() => void handleStopJob(record)}
          >
            停止
          </Button>
          <Button
            size="small"
            loading={operatingJobIds.includes(record.id)}
            onClick={() => void handleRetryJob(record)}
          >
            重试
          </Button>
        </Space>
      )
    }
  ]

  const createJobUserColumns = (job: Job) => [
    {
      title: '用户',
      key: 'user',
      width: 260,
      render: (_: unknown, result: UserResult) => (
        <Space direction="vertical" size={0}>
          <Text>{result.nickname}</Text>
          <Text copyable type="secondary" className="admin-code-text">{result.openid}</Text>
        </Space>
      )
    },
    {
      title: '汇总',
      key: 'counts',
      width: 190,
      render: (_: unknown, result: UserResult) => summarizeUserResult(result)
    },
    {
      title: '明细',
      key: 'details',
      width: 720,
      render: (_: unknown, result: UserResult) => (
        <Space direction="vertical" size={2}>
          {result.results.map((meal) => {
            const color = meal.status === 'ordered' ? 'success' : meal.status === 'error' ? 'error' : 'default'
            return (
              <Text key={`${meal.date}-${meal.mealType}-${meal.packageName || meal.message}`} style={{ fontSize: 12 }}>
                <Tag color={color}>{meal.status === 'ordered' ? '成功' : meal.status === 'error' ? '失败' : '未匹配'}</Tag>
                {meal.dateLabel} {meal.date} {meal.mealTypeLabel}
                {meal.packageName ? ` - ${meal.packageName}` : ''}
                {meal.message ? `：${meal.message}` : ''}
              </Text>
            )
          })}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right' as const,
      render: (_: unknown, result: UserResult) => {
        const key = `${job.id}:${result.openid}`
        return (
          <Button
            size="small"
            loading={retryingUsers.includes(key)}
            onClick={() => void handleRetryUser(job, result)}
          >
            重试此人
          </Button>
        )
      }
    }
  ]

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <Title level={3} style={{ margin: 0 }}>狂吃管理后台</Title>
        <Text type="secondary">监控人员、触发任务和执行结果</Text>
      </div>

      <Card title="手动触发" className="admin-card">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div className="admin-setting-row">
            <Space direction="vertical" size={0}>
              <Text strong>飞书结果通知</Text>
              <Text type="secondary">任务完成或失败后发送群机器人通知</Text>
            </Space>
            <Switch
              checked={appSettings?.feishuNotifyEnabled ?? true}
              loading={settingsLoading || settingsSaving}
              checkedChildren="开"
              unCheckedChildren="关"
              onChange={handleFeishuNotifyChange}
            />
          </div>
          <div className="admin-setting-row admin-setting-row--stacked">
            <Space direction="vertical" size={4}>
              <Text strong>执行范围</Text>
              <Text type="secondary">
                {appSettings?.orderSelectedWeekdays || appSettings?.orderSelectedMealTypes
                  ? '当前使用管理员覆盖配置'
                  : '当前默认沿用用户选择'}
              </Text>
            </Space>
            <Space direction="vertical" size={10} className="admin-execution-settings">
              <div className="admin-checkbox-line">
                <Text className="admin-checkbox-line__label">工作日</Text>
                <Checkbox.Group
                  options={WEEKDAY_OPTIONS}
                  value={executionWeekdays}
                  disabled={!monitor || settingsLoading || settingsSaving}
                  onChange={(values) => setExecutionWeekdays(values.map(Number).sort((a, b) => a - b))}
                />
              </div>
              <div className="admin-checkbox-line">
                <Text className="admin-checkbox-line__label">餐次</Text>
                <Checkbox.Group
                  options={MEAL_OPTIONS}
                  value={executionMealTypes}
                  disabled={!monitor || settingsLoading || settingsSaving}
                  onChange={(values) => setExecutionMealTypes(values.map(Number).sort((a, b) => a - b))}
                />
              </div>
              <Space>
                <Button
                  type="primary"
                  size="small"
                  loading={settingsSaving}
                  disabled={!monitor || settingsLoading}
                  onClick={() => void handleExecutionSettingsSave()}
                >
                  保存执行范围
                </Button>
                <Button
                  size="small"
                  loading={settingsSaving}
                  disabled={!monitor || settingsLoading}
                  onClick={() => void handleExecutionSettingsReset()}
                >
                  恢复用户选择
                </Button>
              </Space>
            </Space>
          </div>
          <Button type="primary" size="large" loading={triggering} onClick={handleTrigger}>
            手动触发抢饭
          </Button>
          {activeJob && (
            <Alert
              type={activeJob.status === 'failed' ? 'error' : activeJob.status === 'succeeded' ? 'success' : 'info'}
              message={`当前任务: ${activeJob.id.slice(0, 8)}... 状态: ${STATUS_TAG[activeJob.status]?.label || activeJob.status}`}
              description={
                activeJob.result
                  ? `成功${activeJob.result.counts.ordered} / 未匹配${activeJob.result.counts.no_match} / 失败${activeJob.result.counts.error}`
                  : activeJob.error || undefined
              }
              showIcon
            />
          )}
        </Space>
      </Card>

      {monitor && (
        <Card title="监控人员" extra={<Text type="secondary">共 {monitor.users.length} 人</Text>} className="admin-card">
          <Table
            dataSource={monitor.users}
            columns={monitorUserColumns}
            rowKey="openid"
            size="small"
            pagination={false}
            scroll={{ x: 1520 }}
          />
        </Card>
      )}

      <Card title="最近任务" className="admin-card">
        <Table
	          dataSource={jobs}
          columns={jobColumns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 760 }}
          expandable={{
	            expandedRowRender: (record: Job) =>
	              record.result ? (
	                <Table
	                  dataSource={record.result.users}
	                  columns={createJobUserColumns(record)}
	                  rowKey="openid"
	                  size="small"
	                  pagination={false}
	                  scroll={{ x: 1280 }}
	                />
              ) : (
                <Text type="secondary">{record.error || '暂无结果'}</Text>
              )
          }}
        />
      </Card>

      {monitor && (
        <Card title="当前监控配置" className="admin-card">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="用户">
              {monitor.users.filter(u => u.enabled).map(u => u.nickname || u.openid).join('、')}
            </Descriptions.Item>
            <Descriptions.Item label="日期基准">{monitor.settings.weekPick}</Descriptions.Item>
            <Descriptions.Item label="工作日">
              {formatWeekdays(monitor.settings.selectedWeekdays)}
            </Descriptions.Item>
            <Descriptions.Item label="餐次">
              {formatMealTypes(monitor.settings.selectedMealTypes)}
            </Descriptions.Item>
            <Descriptions.Item label="管理员执行范围">
              {appSettings?.orderSelectedWeekdays || appSettings?.orderSelectedMealTypes
                ? `${formatWeekdays(appSettings.orderSelectedWeekdays || monitor.settings.selectedWeekdays)}；${formatMealTypes(appSettings.orderSelectedMealTypes || monitor.settings.selectedMealTypes)}`
                : '未覆盖，按用户选择执行'}
            </Descriptions.Item>
            <Descriptions.Item label="匹配模式">
              {monitor.settings.matchMode === 'keywords' ? `关键词: ${monitor.settings.keywords}` : '库存阈值'}
            </Descriptions.Item>
            <Descriptions.Item label="地址">{monitor.settings.addressDetail}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  )
}

export default AdminPage
