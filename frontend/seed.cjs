const { createClient } = require('@supabase/supabase-js');

// Constants from local supabase setup
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEFAULT_PASSWORD = 'Test12345';

async function seed() {
  console.log('Seeding database...');

  const users = [
    { email: 'admin@test.com', firstName: 'System', lastName: 'Admin', role: 'admin' },
    { email: 'instructor@test.com', firstName: 'Jane', lastName: 'Instructor', role: 'instructor' },
    { email: 'student@test.com', firstName: 'John', lastName: 'Student', role: 'student', clinicalRole: 'pharmacy' },
    { email: 'pt.student@test.com', firstName: 'Sam', lastName: 'PT Student', role: 'student', clinicalRole: 'physical_therapy' }
  ];

  for (const u of users) {
    console.log(`Creating user ${u.email}...`);
    // 1. Create Auth User
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true
    });

    let userId;

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        // User exists in auth — look up their ID so we can still update the profile
        const { data: list, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error(`Could not list users to find ${u.email}:`, listError.message);
          continue;
        }
        const existing = list.users.find((usr) => usr.email === u.email);
        if (!existing) {
          console.error(`Could not find existing user for ${u.email}`);
          continue;
        }
        userId = existing.id;
        console.log(`User ${u.email} already exists, ensuring profile is up to date...`);
      } else {
        console.error(`Error creating ${u.email}:`, authError.message);
        continue;
      }
    } else {
      userId = authData.user.id;
    }

    // 2. Upsert Profile — works whether the profile row exists or not
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: userId,
        first_name: u.firstName,
        last_name: u.lastName,
        account_type: u.role,
        active: true
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error(`Error updating profile for ${u.email}:`, profileError.message);
    } else {
      console.log(`Profile updated for ${u.email}.`);
    }

    // 3. Assign clinical role when specified
    if (u.clinicalRole) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('role_id')
        .eq('role_name', u.clinicalRole)
        .single();

      if (roleError) {
        console.error(`Error finding clinical role ${u.clinicalRole}:`, roleError.message);
        continue;
      }

      const { error: assignmentError } = await supabase
        .from('profile_roles')
        .upsert(
          { user_id: userId, role_id: roleData.role_id },
          { onConflict: 'user_id,role_id' }
        );

      if (assignmentError) {
        console.error(`Error assigning ${u.clinicalRole} to ${u.email}:`, assignmentError.message);
      } else {
        console.log(`Clinical role ${u.clinicalRole} assigned to ${u.email}.`);
      }
    }
  }

  // Seed sample patient
  console.log('Creating sample patient...');
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert([
      {
        first_name: 'John',
        last_name: 'Doe',
        age: 45,
        sex: 'Male',
        occupation: 'Software Engineer',
        current_medications: [{ medicine: { name: "Lisinopril", unit: "mg" }, dosage: 10, frequency: 1 }],
        last_visit: '2026-09-01',
        last_visit_notes: 'Patient complained of mild headaches.'
      }
    ])
    .select()
    .single();

  if (patientError) {
    console.error('Error creating patient:', patientError.message);
  } else {
    console.log('Sample patient created with ID:', patient.id);

    // Seed sample visit
    console.log('Creating sample visit...');
    const { error: visitError } = await supabase
      .from('visits')
      .insert([
        {
          patient_id: patient.id,
          visit_type: 'Initial Consultation',
          notes: 'Patient discussed ongoing back pain and requested physical therapy referral.',
          medications: 'Ibuprofen as needed'
        }
      ]);

    if (visitError) console.error('Error creating visit:', visitError.message);
    else console.log('Sample visit created.');

    // Seed sample appointment
    console.log('Creating sample appointment...');
    const { error: apptError } = await supabase
      .from('appointments')
      .insert([
        {
          patient_id: patient.id,
          appointment_type: 'Follow-up',
          scheduled_date: '2026-10-15',
          scheduled_time: '14:30:00',
          notes: 'Check progress on back pain therapy.',
          status: 'scheduled'
        }
      ]);

    if (apptError) console.error('Error creating appointment:', apptError.message);
    else console.log('Sample appointment created.');
  }

  // Seed course + enrollment
  console.log('Looking up instructor and student IDs...');
  const { data: userListForCourse } = await supabase.auth.admin.listUsers();
  const instructorForCourse = userListForCourse?.users?.find(u => u.email === 'instructor@test.com');
  const studentForCourse = userListForCourse?.users?.find(u => u.email === 'student@test.com');

  const ptStudentForCourse = userListForCourse?.users?.find(u => u.email === 'pt.student@test.com');

  if (instructorForCourse && studentForCourse) {
    console.log('Creating PHARM 4301 course...');
    const { data: pharmCourse, error: pharmCourseError } = await supabase
      .from('courses')
      .upsert(
        { instructor_id: instructorForCourse.id, course_number: 'PHARM 4301', crn: '11234', discipline: 'pharmacy' },
        { onConflict: 'instructor_id,crn', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (pharmCourseError) {
      console.error('Error creating PHARM course:', pharmCourseError.message);
    } else {
      console.log('PHARM 4301 created with ID:', pharmCourse.id);
      const { error: enrollError } = await supabase
        .from('course_enrollments')
        .upsert(
          { course_id: pharmCourse.id, student_id: studentForCourse.id, enrolled_by: instructorForCourse.id },
          { onConflict: 'course_id,student_id', ignoreDuplicates: true }
        );
      if (enrollError) console.error('Error enrolling student@test.com:', enrollError.message);
      else console.log('student@test.com enrolled in PHARM 4301.');
    }

    if (ptStudentForCourse) {
      console.log('Creating PT 3301 course...');
      const { data: ptCourse, error: ptCourseError } = await supabase
        .from('courses')
        .upsert(
          { instructor_id: instructorForCourse.id, course_number: 'PT 3301', crn: '22345', discipline: 'physical_therapy' },
          { onConflict: 'instructor_id,crn', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (ptCourseError) {
        console.error('Error creating PT course:', ptCourseError.message);
      } else {
        console.log('PT 3301 created with ID:', ptCourse.id);
        const { error: ptEnrollError } = await supabase
          .from('course_enrollments')
          .upsert(
            { course_id: ptCourse.id, student_id: ptStudentForCourse.id, enrolled_by: instructorForCourse.id },
            { onConflict: 'course_id,student_id', ignoreDuplicates: true }
          );
        if (ptEnrollError) console.error('Error enrolling pt.student@test.com:', ptEnrollError.message);
        else console.log('pt.student@test.com enrolled in PT 3301.');
      }
    }
  }

  // Seed template + case assignment
  console.log('Looking up instructor and student IDs...');
  const { data: userList } = await supabase.auth.admin.listUsers();
  const instructorUser = userList?.users?.find(u => u.email === 'instructor@test.com');
  const studentUser = userList?.users?.find(u => u.email === 'student@test.com');

  // Look up the sample course so case assignment can reference it
  const { data: sampleCourse } = await supabase
    .from('courses')
    .select('id')
    .eq('crn', '11234')
    .maybeSingle();

  if (instructorUser && studentUser) {
    console.log('Creating sample template...');
    const { data: template, error: templateError } = await supabase
      .from('patient_templates')
      .insert({
        instructor_id: instructorUser.id,
        title: 'Chest Pain — Rule Out ACS',
        target_year: 'P2',
        discipline: 'Pharmacotherapy',
        first_name: 'Maria',
        last_name: 'Garcia',
        age: 58,
        sex: 'Female',
        occupation: 'Teacher',
        chief_complaint: 'Chest pain radiating to the left arm for the past 2 hours.',
        clinical_baseline: {
          'BP': '158/94 mmHg',
          'HR': '102 bpm',
          'RR': '18 breaths/min',
          'Temp': '37.1°C',
          'O2 Sat': '96% on room air',
          'Troponin I': '0.08 ng/mL (elevated)',
          'BNP': '210 pg/mL',
        },
        student_instructions: 'You are a pharmacy student on rotation in the emergency department. The patient was brought in by ambulance. Review her history, assess her medications, and document your clinical reasoning and recommended pharmacotherapy plan.',
        hidden_diagnosis: 'NSTEMI — Non-ST-elevation myocardial infarction',
        expectations_rubric: '1. Identify the likely diagnosis based on vitals and labs\n2. List at least 3 drug therapy recommendations with rationale\n3. Note any drug interactions or contraindications\n4. Document monitoring parameters for chosen therapies',
        allergies: ['Penicillin'],
        medical_history: ['Hypertension', 'Type 2 Diabetes', 'Hyperlipidemia'],
        current_medications: [
          { medicine: { name: 'Metformin', unit: 'mg' }, dosage: 500, frequency: 2 },
          { medicine: { name: 'Atorvastatin', unit: 'mg' }, dosage: 40, frequency: 1 },
          { medicine: { name: 'Amlodipine', unit: 'mg' }, dosage: 5, frequency: 1 },
        ],
      })
      .select()
      .single();

    if (templateError) {
      console.error('Error creating template:', templateError.message);
    } else {
      console.log('Sample template created with ID:', template.id);

      const patientSnapshot = {
        first_name: template.first_name,
        last_name: template.last_name,
        age: template.age,
        sex: template.sex,
        occupation: template.occupation,
        chief_complaint: template.chief_complaint,
        clinical_baseline: template.clinical_baseline,
        allergies: template.allergies,
        medical_history: template.medical_history,
        current_medications: template.current_medications,
        student_instructions: template.student_instructions,
        expectations_rubric: template.expectations_rubric,
      };

      console.log('Assigning case to student...');
      const { error: caseError } = await supabase
        .from('assigned_cases')
        .insert({
          template_id: template.id,
          student_id: studentUser.id,
          assigned_by: instructorUser.id,
          patient_snapshot: patientSnapshot,
          due_date: '2026-10-15',
          assignment_notes: 'Focus on antiplatelet and anticoagulation therapy options.',
          course_id: sampleCourse?.id ?? null,
        });

      if (caseError) console.error('Error assigning case:', caseError.message);
      else console.log('Case assigned to student@test.com.');
    }
  } else {
    console.error('Could not find instructor or student user — skipping template/case seed.');
  }

  console.log('Seeding complete!');
}

seed().catch(err => console.error('Unexpected error:', err));
