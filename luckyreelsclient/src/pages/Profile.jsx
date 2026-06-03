import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHub } from '../hub'
import Stars from '../components/Stars'

const AVATAR_PRESETS = [
    'linear-gradient(135deg,#FFD700,#FFA500)',
    'linear-gradient(135deg,#0AF5F5,#7F5AF0)',
    'linear-gradient(135deg,#00FF87,#0AF5F5)',
    'linear-gradient(135deg,#FF2D55,#FF9500)',
    'linear-gradient(135deg,#c688ff,#FF2D8B)',
    'linear-gradient(135deg,#f5f7fa,#8fd3f4)',
]

export default function Profile() {
    const { isAuthed, tokens, playerName, profileAvatar, setProfileAvatar, profileImageUrl, setProfileImageUrl, permission, setPermission, disconnect } = useHub()
    const navigate = useNavigate()
    const fileRef = useRef(null)
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!isAuthed) navigate('/')
    }, [isAuthed, navigate])

    useEffect(() => {
        if (!isAuthed) return
        const token = localStorage.getItem('lr_token')
        fetch('/api/v1/Profile/Me', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => res.ok ? res.json() : null)
            .then(profile => {
                if (!profile) return
                setProfileAvatar(profile.profileAvatar ?? null)
                setProfileImageUrl(profile.profileImageUrl ?? null)
                setPermission(profile.permission ?? '')
            })
            .catch(() => showMessage('Could not refresh profile.'))
    }, [isAuthed])

    function showMessage(text) {
        setMessage(text)
        setTimeout(() => setMessage(''), 2200)
    }

    async function saveAvatar(avatar, successMessage) {
        const token = localStorage.getItem('lr_token')
        setSaving(true)
        try {
            const res = await fetch('/api/v1/Profile/Avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ProfileAvatar: avatar }),
            })
            if (!res.ok) {
                showMessage('Could not save profile picture.')
                return
            }
            const profile = await res.json()
            setProfileAvatar(profile.profileAvatar ?? null)
            setProfileImageUrl(profile.profileImageUrl ?? null)
            setPermission(profile.permission ?? '')
            showMessage(successMessage)
        } catch {
            showMessage('Could not reach server.')
        } finally {
            setSaving(false)
        }
    }

    function choosePreset(avatar) {
        saveAvatar(avatar, 'Profile picture updated.')
    }

    function clearAvatar() {
        saveAvatar(null, 'Profile picture reset.')
    }

    function uploadAvatar(event) {
        const file = event.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            showMessage('Choose an image file.')
            return
        }
        if (file.size > 400_000) {
            showMessage('Choose an image under 400 KB.')
            return
        }

        saveImage(file)
        event.target.value = ''
    }

    async function saveImage(file) {
        const token = localStorage.getItem('lr_token')
        const form = new FormData()
        form.append('image', file)
        setSaving(true)
        try {
            const res = await fetch('/api/v1/Profile/AvatarImage', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            })
            if (!res.ok) {
                showMessage('Could not upload profile picture.')
                return
            }
            const profile = await res.json()
            setProfileAvatar(profile.profileAvatar ?? null)
            setProfileImageUrl(profile.profileImageUrl ?? null)
            setPermission(profile.permission ?? '')
            showMessage('Profile picture uploaded.')
        } catch {
            showMessage('Could not reach server.')
        } finally {
            setSaving(false)
        }
    }

    const avatarStyle = profileImageUrl
        ? { backgroundImage: `url(${profileImageUrl})` }
        : { background: profileAvatar ?? AVATAR_PRESETS[0] }

    return (
        <>
            <Stars count={100} />
            <div className="page-bg" />
            <div className="profile-page">
                <div className="profile-shell">
                    <div className="profile-topbar">
                        <button className="back-btn" onClick={() => navigate('/')}>BACK TO LOBBY</button>
                        <button className="hub-logout-btn" onClick={disconnect}>Logout</button>
                    </div>

                    <section className="profile-panel">
                        <div className="profile-avatar-wrap">
                            <div className="profile-avatar" style={avatarStyle}>
                                {!profileImageUrl && playerName.slice(0, 1).toUpperCase()}
                            </div>
                            <button className="profile-upload-btn" onClick={() => fileRef.current?.click()}>Upload image</button>
                            <input ref={fileRef} className="profile-file-input" type="file" accept="image/*" onChange={uploadAvatar} />
                        </div>

                        <div className="profile-details">
                            <div className="profile-kicker">Player profile</div>
                            <h1>{playerName}</h1>
                            <div className="profile-stat-grid">
                                <div className="profile-stat">
                                    <span>Tokens</span>
                                    <strong>{tokens.toLocaleString()}</strong>
                                </div>
                                <div className="profile-stat">
                                    <span>Status</span>
                                    <strong>Online</strong>
                                </div>
                                <div className="profile-stat">
                                    <span>Permission</span>
                                    <strong>{permission || 'Player'}</strong>
                                </div>
                            </div>

                            <div className="profile-section-label">Profile picture</div>
                            <div className="avatar-presets">
                                {AVATAR_PRESETS.map(avatar => (
                                    <button
                                        key={avatar}
                                        className={`avatar-preset${profileAvatar === avatar ? ' active' : ''}`}
                                        style={{ background: avatar }}
                                        onClick={() => choosePreset(avatar)}
                                        aria-label="Choose profile picture preset"
                                    />
                                ))}
                            </div>

                            <div className="profile-actions">
                                <button className="profile-secondary-btn" onClick={clearAvatar} disabled={saving}>Reset picture</button>
                                <button className="profile-primary-btn" onClick={() => navigate('/')}>Done</button>
                            </div>
                            {message && <div className="profile-message">{message}</div>}
                        </div>
                    </section>
                </div>
            </div>
        </>
    )
}
