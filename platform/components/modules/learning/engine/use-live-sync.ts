'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { learningAPI } from '@/lib/api'

interface LivePosition {
  scroll_percent: number
  page: number
  active: boolean
  instructor_name?: string
}

export function useLiveSync(lessonId: number, isInstructor: boolean) {
  const [followLecturer, setFollowLecturer] = useState(false)
  const [live, setLive] = useState<LivePosition>({ scroll_percent: 0, page: 1, active: false })
  const scrollRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(false)

  const broadcastScroll = useCallback((scrollPercent: number, page = 1) => {
    if (!isInstructor) return
    learningAPI.setLivePosition(lessonId, {
      scroll_percent: scrollPercent,
      page,
      active: true,
    }).catch(() => {})
  }, [isInstructor, lessonId])

  useEffect(() => {
    if (isInstructor || !followLecturer) return
    const poll = () => {
      learningAPI.getLivePosition(lessonId)
        .then((r) => {
          setLive(r.data)
          if (r.data.active && scrollRef.current && followingRef.current) {
            const el = scrollRef.current
            const target = (r.data.scroll_percent / 100) * (el.scrollHeight - el.clientHeight)
            el.scrollTo({ top: target, behavior: 'smooth' })
          }
        })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [isInstructor, followLecturer, lessonId])

  useEffect(() => {
    followingRef.current = followLecturer
  }, [followLecturer])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const pct = el.scrollHeight > el.clientHeight
      ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
      : 0
    if (isInstructor) broadcastScroll(pct)
  }, [isInstructor, broadcastScroll])

  return { scrollRef, followLecturer, setFollowLecturer, live, onScroll, isInstructor, broadcastScroll }
}
