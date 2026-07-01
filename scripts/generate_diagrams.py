# -*- coding: utf-8 -*-
"""Generate Chapter 3 UML diagrams from actual IBBUL Academic OS implementation."""
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle, Ellipse, Polygon
import matplotlib.lines as mlines

OUT = Path(__file__).resolve().parent.parent / 'report_assets' / 'diagrams'
OUT.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    'font.family': 'DejaVu Sans',
    'font.size': 9,
    'figure.dpi': 200,
})

GREEN = '#0F6B3E'
LIGHT = '#E8F5EE'
GRAY = '#64748B'
BLUE = '#1E40AF'


def save(fig, name):
    path = OUT / name
    fig.savefig(path, bbox_inches='tight', facecolor='white', edgecolor='none')
    plt.close(fig)
    print(f'Wrote {path}')


def box(ax, x, y, w, h, text, fc='white', ec=GREEN, fs=8, bold=False):
    p = FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.02,rounding_size=0.08',
                       linewidth=1.2, edgecolor=ec, facecolor=fc)
    ax.add_patch(p)
    weight = 'bold' if bold else 'normal'
    ax.text(x + w / 2, y + h / 2, text, ha='center', va='center', fontsize=fs,
            weight=weight, wrap=True)


def arrow(ax, x1, y1, x2, y2, label=''):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=GRAY, lw=1.2))
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.08, label, ha='center', fontsize=7, color=GRAY)


def architecture_diagram():
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    box(ax, 3.8, 5.0, 2.4, 0.7, 'Web Browser\n(Student / Lecturer / HOD / Admin)', fc=LIGHT, bold=True)
    box(ax, 3.2, 3.6, 3.6, 0.9, 'Next.js 14 Frontend (Vercel)\nReact · TypeScript · Tailwind · Axios', fc='#F0F9FF', ec=BLUE)
    box(ax, 3.0, 2.1, 4.0, 0.9, 'Django 5 REST API (Render)\naccounts · core · academics · learning', fc=LIGHT)
    box(ax, 0.4, 0.3, 2.2, 0.8, 'PostgreSQL\n(Neon / Render DB)', fc='#FFF7ED')
    box(ax, 3.4, 0.3, 2.2, 0.8, 'Cloudinary\n(Media & Branding)', fc='#FFF7ED')
    box(ax, 6.4, 0.3, 2.2, 0.8, 'SendGrid SMTP\n(Invitations / Email)', fc='#FFF7ED')
    box(ax, 8.0, 2.1, 1.6, 0.7, 'Redis\n(Optional Celery)', fc='#FFF7ED', fs=7)
    arrow(ax, 5, 5.0, 5, 4.5, 'HTTPS')
    arrow(ax, 5, 3.6, 5, 3.0, 'JWT REST\n/api/backend/* proxy')
    arrow(ax, 4.2, 2.1, 1.5, 1.1)
    arrow(ax, 5.0, 2.1, 4.5, 1.1)
    arrow(ax, 6.0, 2.1, 7.5, 1.1)
    arrow(ax, 6.8, 2.1, 8.8, 2.1)
    save(fig, 'figure_3_1_system_architecture.png')


def use_case_diagram():
    fig, ax = plt.subplots(figsize=(11, 7))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 7)
    ax.axis('off')
    sys = Ellipse((5.5, 3.5), 8.5, 5.8, fill=False, edgecolor=GREEN, lw=1.5)
    ax.add_patch(sys)
    ax.text(5.5, 6.2, 'IBBUL Unified Academic OS', ha='center', fontsize=10, weight='bold', color=GREEN)
    cases = [
        (3.2, 5.0, 'View approved\nresults'),
        (5.5, 5.2, 'Enrol & access\nLMS content'),
        (7.8, 5.0, 'Attempt quiz /\nsubmit assignment'),
        (2.5, 3.5, 'Manage course\nofferings & grades'),
        (5.5, 3.5, 'Upload & validate\nresults (HOD)'),
        (8.5, 3.5, 'Approve /\nreject results'),
        (3.5, 1.8, 'Manage faculty,\ndepartments, users'),
        (5.5, 1.8, 'Assign lecturers\nto courses'),
        (7.5, 1.8, 'Audit logs &\ngovernance'),
    ]
    for x, y, t in cases:
        e = Ellipse((x, y), 2.0, 0.85, facecolor=LIGHT, edgecolor=GREEN, lw=1)
        ax.add_patch(e)
        ax.text(x, y, t, ha='center', va='center', fontsize=7)
    actors = [
        (0.5, 5.0, 'Student'),
        (0.5, 3.2, 'Examiner\n(Lecturer)'),
        (0.5, 1.5, 'HOD'),
        (10.5, 4.5, 'Faculty\nAdmin'),
        (10.5, 2.0, 'Super\nAdmin'),
    ]
    for x, y, name in actors:
        ax.add_patch(Circle((x, y + 0.35), 0.22, fc=GRAY))
        ax.plot([x, x], [y + 0.13, y - 0.25], color=GRAY, lw=1.2)
        ax.plot([x - 0.25, x + 0.25], [y - 0.05, y - 0.05], color=GRAY, lw=1.2)
        ax.text(x, y - 0.55, name, ha='center', fontsize=7, weight='bold')
    save(fig, 'figure_3_2_use_case.png')


def erd_diagram():
    fig, ax = plt.subplots(figsize=(12, 8))
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 8)
    ax.axis('off')

    def entity(x, y, name, attrs):
        h = 0.35 + len(attrs) * 0.28
        box(ax, x, y, 2.4, h, '', fc='white')
        ax.add_patch(FancyBboxPatch((x, y + h - 0.35), 2.4, 0.35, boxstyle='square,pad=0',
                                    facecolor=GREEN, edgecolor=GREEN))
        ax.text(x + 1.2, y + h - 0.17, name, ha='center', va='center', color='white', fontsize=8, weight='bold')
        for i, a in enumerate(attrs):
            ax.text(x + 0.1, y + h - 0.55 - i * 0.28, a, fontsize=7, va='center')

    entity(0.3, 5.5, 'User', ['PK id', 'student_id', 'email', 'role', 'faculty_id', 'department_fk_id'])
    entity(3.2, 6.2, 'Faculty', ['PK id', 'name', 'code'])
    entity(3.2, 4.5, 'Department', ['PK id', 'FK faculty_id', 'name', 'code'])
    entity(6.0, 6.2, 'Course', ['PK id', 'FK department_id', 'code', 'title', 'credit_units'])
    entity(6.0, 4.2, 'Result', ['PK id', 'FK student_id', 'FK course_id', 'session', 'semester', 'score', 'grade', 'status'])
    entity(9.0, 6.2, 'LMSOffering', ['PK id', 'FK course_id', 'FK instructor_id', 'session', 'semester'])
    entity(9.0, 4.5, 'Module', ['PK id', 'FK offering_id', 'title', 'order'])
    entity(9.0, 2.5, 'Lesson', ['PK id', 'FK module_id', 'content_type', 'title'])
    entity(6.0, 1.5, 'Enrollment', ['PK id', 'FK offering_id', 'FK student_id'])
    entity(3.2, 1.5, 'ResultUploadBatch', ['PK id', 'FK uploaded_by', 'FK department_id', 'status'])
    entity(0.3, 2.5, 'StudentCourseRegistration', ['PK id', 'FK student_id', 'FK course_id', 'session', 'semester'])

    rels = [
        ((2.7, 6.0), (3.2, 6.4), '1:N'),
        ((4.4, 5.8), (6.0, 6.5), '1:N'),
        ((2.7, 5.8), (6.0, 4.8), '1:N'),
        ((7.2, 6.0), (9.0, 6.5), '1:N'),
        ((10.2, 6.0), (10.2, 5.0), '1:N'),
        ((10.2, 4.2), (10.2, 3.2), '1:1 quiz/assignment'),
        ((2.7, 2.8), (3.2, 2.0), '1:N'),
        ((7.2, 1.8), (9.0, 2.0), 'N:1'),
    ]
    for (x1, y1), (x2, y2), lbl in rels:
        arrow(ax, x1, y1, x2, y2, lbl)
    save(fig, 'figure_3_3_erd.png')


def class_diagram():
    fig, ax = plt.subplots(figsize=(11, 7.5))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 7.5)
    ax.axis('off')

    def cls(x, y, name, lines):
        h = 0.4 + len(lines) * 0.25
        box(ax, x, y, 2.6, h, '', fc='white')
        ax.plot([x, x + 2.6], [y + h - 0.35, y + h - 0.35], color=GREEN, lw=1)
        ax.text(x + 1.3, y + h - 0.17, name, ha='center', fontsize=8, weight='bold')
        for i, ln in enumerate(lines):
            ax.text(x + 0.1, y + h - 0.55 - i * 0.25, ln, fontsize=7, family='monospace')
        return x + 2.6, y + h / 2

    cls(0.2, 5.5, 'User', ['+ id, student_id, email', '+ role, module_access', '+ authenticate()'])
    cls(3.5, 5.5, 'Result', ['+ score, grade, status', '+ session, semester', '+ approve(), lock()'])
    cls(6.8, 5.5, 'Course', ['+ code, title', '+ credit_units'])
    cls(0.2, 2.8, 'LMSOffering', ['+ session, semester', '+ is_published'])
    cls(3.5, 2.8, 'Module', ['+ title, order'])
    cls(6.8, 2.8, 'Lesson', ['+ content_type', '+ file_key'])
    cls(0.2, 0.3, 'Quiz / Assignment', ['+ max_score, due_at', '+ submit(), grade()'])
    cls(3.5, 0.3, 'ResultUploadBatch', ['+ status, checksum', '+ validate(), submit()'])
    cls(6.8, 0.3, 'Enrollment', ['+ enrolled_at, is_active'])

    for x1, y1, x2, y2, lbl in [
        (2.8, 5.9, 3.5, 5.9, '1..*'),
        (6.1, 5.9, 6.8, 5.9, '1'),
        (1.5, 5.5, 1.5, 3.5, '1..*'),
        (4.8, 2.8, 4.8, 1.0, '1..*'),
        (2.8, 3.2, 3.5, 3.2, '1..*'),
        (6.1, 3.2, 6.8, 3.2, '1'),
        (4.1, 0.6, 4.1, 2.8, 'creates'),
    ]:
        arrow(ax, x1, y1, x2, y2, lbl)
    save(fig, 'figure_3_4_class.png')


def sequence_diagram():
    fig, ax = plt.subplots(figsize=(11, 6.5))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6.5)
    ax.axis('off')
    actors = ['Student', 'ResultsPage\n(Next.js)', 'api.ts', 'API Proxy\n(Vercel)', 'ResultViewSet\n(Django)', 'PostgreSQL']
    xs = [0.8, 2.4, 4.0, 5.6, 7.6, 9.6]
    for x, name in zip(xs, actors):
        ax.text(x, 6.1, name, ha='center', fontsize=7, weight='bold')
        ax.plot([x, x], [0.4, 5.8], '--', color=GRAY, lw=0.8)
    steps = [
        (0, 1, 5.5, '1. GET /results'),
        (1, 2, 5.1, '2. getMyResults()'),
        (2, 3, 4.7, '3. GET /api/backend/.../my_results/'),
        (3, 4, 4.3, '4. Forward with JWT'),
        (4, 5, 3.9, '5. SELECT Result\n(status APPROVED | LOCKED_PUBLISHED)'),
        (5, 4, 3.5, '6. Rows + SemesterSummary'),
        (4, 3, 3.1, '7. JSON response'),
        (3, 2, 2.7, '8. JSON'),
        (2, 1, 2.3, '9. Render semester tabs'),
        (1, 0, 1.9, '10. Display results'),
    ]
    for fr, to, y, lbl in steps:
        x1, x2 = xs[fr], xs[to]
        color = GREEN if fr < to else BLUE
        ax.annotate('', xy=(x2, y), xytext=(x1, y),
                    arrowprops=dict(arrowstyle='->', color=color, lw=1.1))
        ax.text((x1 + x2) / 2, y + 0.12, lbl, ha='center', fontsize=6.5)
    save(fig, 'figure_3_5_sequence_result_check.png')


def activity_diagram():
    fig, ax = plt.subplots(figsize=(8, 10))
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 10)
    ax.axis('off')
    nodes = [
        (2.5, 9.2, 3, 0.55, 'Start: HOD opens /hod/upload', 'rect', LIGHT),
        (2.5, 8.3, 3, 0.55, 'Select Excel/CSV, session, semester', 'rect', 'white'),
        (2.5, 7.4, 3, 0.55, 'POST /hod/upload/validate/', 'rect', 'white'),
        (2.5, 6.4, 3, 0.65, 'Parse file (IBBUL wide format)\nValidate matric, course, scores', 'rect', 'white'),
        (2.8, 5.3, 2.4, 0.7, 'Validation\nerrors?', 'diamond', '#FEF3C7'),
        (0.4, 4.2, 2.2, 0.55, 'Show error report\n(fix & re-validate)', 'rect', '#FEE2E2'),
        (4.8, 4.2, 2.2, 0.55, 'HOD confirms submit', 'rect', LIGHT),
        (4.8, 3.2, 2.2, 0.55, 'POST /hod/upload/submit/', 'rect', 'white'),
        (4.8, 2.2, 2.2, 0.75, 'Create ResultUploadBatch\nSave Result (HOD_REVIEW)', 'rect', 'white'),
        (4.8, 1.1, 2.2, 0.55, 'HOD approves → LOCKED_PUBLISHED', 'rect', LIGHT),
        (4.8, 0.2, 2.2, 0.55, 'Student views via /results', 'rect', '#DCFCE7'),
    ]
    for x, y, w, h, text, kind, fc in nodes:
        if kind == 'diamond':
            cx, cy = x + w / 2, y + h / 2
            pts = [(cx, y + h), (x + w, cy), (cx, y), (x, cy)]
            ax.add_patch(Polygon(pts, closed=True, facecolor=fc, edgecolor=GREEN, lw=1))
            ax.text(cx, cy, text, ha='center', va='center', fontsize=7)
        else:
            box(ax, x, y, w, h, text, fc=fc, fs=7)
    arrow(ax, 4.0, 9.2, 4.0, 8.85)
    arrow(ax, 4.0, 8.3, 4.0, 7.95)
    arrow(ax, 4.0, 7.4, 4.0, 7.05)
    arrow(ax, 4.0, 6.4, 4.0, 6.0)
    arrow(ax, 3.5, 5.3, 1.5, 4.75, 'Yes')
    arrow(ax, 1.5, 4.2, 1.5, 7.4)
    ax.annotate('', xy=(1.5, 7.4), xytext=(1.5, 4.75), arrowprops=dict(arrowstyle='->', color=GRAY, lw=1))
    arrow(ax, 5.2, 5.3, 5.9, 4.75, 'No')
    arrow(ax, 5.9, 4.2, 5.9, 3.75)
    arrow(ax, 5.9, 3.2, 5.9, 2.95)
    arrow(ax, 5.9, 2.2, 5.9, 1.65)
    arrow(ax, 5.9, 1.1, 5.9, 0.75)
    save(fig, 'figure_3_6_activity_hod_upload.png')


def deployment_diagram():
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    box(ax, 0.5, 4.5, 9, 1.2, 'Client Tier\nWeb browsers (Chrome, Edge, Firefox) — Students, Lecturers, HOD, Administrators', fc=LIGHT, bold=True)
    box(ax, 0.5, 2.7, 4.2, 1.4, 'Presentation Tier — Vercel\nNext.js 14 App (platform/)\n/api/backend/* reverse proxy', fc='#F0F9FF', ec=BLUE)
    box(ax, 5.3, 2.7, 4.2, 1.4, 'Application Tier — Render\nDjango 5 + Gunicorn\nREST API + JWT Auth', fc=LIGHT)
    box(ax, 0.5, 0.4, 2.8, 1.6, 'Data Tier\nPostgreSQL\n(DATABASE_URL)', fc='#FFF7ED')
    box(ax, 3.6, 0.4, 2.8, 1.6, 'Media Tier\nCloudinary\n(lessons, branding)', fc='#FFF7ED')
    box(ax, 6.7, 0.4, 2.8, 1.6, 'Optional\nRedis + Celery\n(async uploads)', fc='#FFF7ED')
    arrow(ax, 5, 4.5, 2.6, 4.1, 'HTTPS')
    arrow(ax, 5, 4.5, 7.4, 4.1, 'HTTPS')
    arrow(ax, 2.6, 2.7, 1.9, 2.0)
    arrow(ax, 7.4, 2.7, 7.4, 2.0)
    arrow(ax, 7.4, 2.7, 5.0, 2.0)
    arrow(ax, 7.4, 2.7, 8.1, 2.0)
    save(fig, 'figure_3_7_deployment.png')


if __name__ == '__main__':
    architecture_diagram()
    use_case_diagram()
    erd_diagram()
    class_diagram()
    sequence_diagram()
    activity_diagram()
    deployment_diagram()
    print('All diagrams generated.')
